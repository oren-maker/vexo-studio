"use server";

import { put } from "@vercel/blob";
import { extractInstagram } from "@/lib/learn/instagram";
import { extractPromptFromVideo } from "@/lib/learn/gemini-prompt-from-video";
import { generatePromptWithClaude } from "@/lib/learn/claude-prompt";
import { prisma } from "@/lib/learn/db";
import { revalidatePath } from "next/cache";

function isQuotaError(e: any): boolean {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("expired");
}

// Full pipeline for an Instagram / TikTok / other social video URL:
// 1. Extract direct MP4 URL + caption + thumbnail
// 2. Re-upload the MP4 to Vercel Blob (so it persists even when IG CDN link expires)
// 3. Send video + caption to Gemini → receive generated prompt + translation + metadata
// 4. Save as LearnSource with status=complete and all the extracted data

export async function ingestSocialVideoAction(rawUrl: string) {
  const url = rawUrl.trim();
  if (!url) return { ok: false as const, error: "URL ריק" };

  // Check what kind of URL it is
  const isInstagram = /(?:^|\.)instagram\.com\//i.test(url);
  if (!isInstagram) {
    return { ok: false as const, error: "רק Instagram נתמך כרגע בזרימה הזו. עבור Pexels/קובץ מקומי — השתמש בטאבים האחרים." };
  }

  try {
    // Step 1: Extract caption + thumbnail (+ optionally video URL — IG often blocks this)
    const ig = await extractInstagram(url);
    if (!ig.caption && !ig.thumbnail && !ig.videoUrl) {
      return { ok: false as const, error: "לא הצלחתי לחלץ שום נתון מהפוסט (אולי פרטי או נחסם)." };
    }

    // Step 2: If we have a direct video URL, download to Blob. Otherwise skip — we'll
    // analyze from caption + thumbnail only (IG no longer exposes MP4 to scrapers).
    let blobUrl: string | null = null;
    if (ig.videoUrl) {
      try {
        const res = await fetch(ig.videoUrl, {
          headers: { "User-Agent": "Mozilla/5.0 vexo-learn" },
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const blob = await put(`instagram/${Date.now()}.mp4`, buffer, {
            access: "public",
            contentType: "video/mp4",
          });
          blobUrl = blob.url;
        }
      } catch {
        // proceed without video — caption+thumbnail still useful
      }
    }

    // Step 3: Create source row
    const source = await prisma.learnSource.create({
      data: {
        type: "instructor_url",
        url: ig.sourceUrl,
        blobUrl: blobUrl || "",
        thumbnail: ig.thumbnail,
        prompt: ig.caption || "(יחולץ מהפוסט)",
        title: (ig.caption || "Instagram reel").slice(0, 150),
        status: "processing",
        addedBy: "instagram",
      },
    });

    // Step 4: Analyze. Prefer video analysis if we have the MP4, else Gemini text+image.
    // When videoUrl was missing, mark the source so the UI can warn the user.
    if (!blobUrl) {
      await prisma.learnSource.update({
        where: { id: source.id },
        data: { error: "ניתוח חלקי: רק תמונת thumbnail + caption (Instagram חוסם הורדת וידאו). להעלות את הסרטון המלא דרך לשונית 'העלאת קובץ'." },
      });
    }
    let analyzed;
    let analysisEngine = blobUrl ? "gemini-video" : "gemini-image";
    try {
      if (blobUrl) {
        try {
          analyzed = await extractPromptFromVideo(blobUrl, ig.caption);
        } catch (e: any) {
          if (!isQuotaError(e)) throw e;
          analyzed = await generatePromptWithClaude(ig.caption, ig.thumbnail);
          analysisEngine = "gemini-text-fallback";
        }
      } else {
        analyzed = await generatePromptWithClaude(ig.caption, ig.thumbnail);
      }
    } catch (e: any) {
      await prisma.learnSource.update({
        where: { id: source.id },
        data: { status: "failed", error: String(e.message || e).slice(0, 500) },
      });
      return { ok: false as const, error: `ניתוח נכשל: ${String(e.message || e).slice(0, 200)}` };
    }

    try {

      // Save analysis + knowledge nodes
      const analysis = await prisma.videoAnalysis.create({
        data: {
          sourceId: source.id,
          description: analyzed.captionEnglish || analyzed.generatedPrompt.slice(0, 300),
          techniques: analyzed.techniques,
          howTo: [],
          tags: analyzed.tags,
          style: analyzed.style,
          mood: analyzed.mood,
          difficulty: null,
          insights: [],
          promptAlignment: null,
          rawGemini: JSON.stringify({ engine: analysisEngine, ...analyzed }),
        },
      });
      const nodes = analyzed.techniques.map((t) => ({
        type: "technique",
        title: t.slice(0, 120),
        body: t,
        tags: [...analyzed.tags, analyzed.style || ""].filter(Boolean),
        confidence: 0.85,
        analysisId: analysis.id,
      }));
      if (nodes.length > 0) await prisma.knowledgeNode.createMany({ data: nodes });

      // Update source with final prompt + title
      await prisma.learnSource.update({
        where: { id: source.id },
        data: {
          prompt: analyzed.generatedPrompt,
          title: analyzed.title || source.title,
          status: "complete",
        },
      });

      revalidatePath("/learn/sources");
      revalidatePath("/learn/my-prompts");

      return {
        ok: true as const,
        id: source.id,
        title: analyzed.title,
        generatedPrompt: analyzed.generatedPrompt,
        captionEnglish: analyzed.captionEnglish,
        originalCaption: ig.caption,
        techniques: analyzed.techniques,
        style: analyzed.style,
        mood: analyzed.mood,
        thumbnail: ig.thumbnail,
        videoUrl: blobUrl,
        engine: analysisEngine,
      };
    } catch (e: any) {
      await prisma.learnSource.update({
        where: { id: source.id },
        data: { status: "failed", error: String(e.message || e).slice(0, 500) },
      });
      return { ok: false as const, error: `שמירה נכשלה: ${String(e.message || e).slice(0, 200)}` };
    }
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e).slice(0, 300) };
  }
}
