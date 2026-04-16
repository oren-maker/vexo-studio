"use server";

import { prisma } from "@/lib/learn/db";
import { extractInstagram } from "@/lib/learn/instagram";
import { extractPromptFromVideo } from "@/lib/learn/gemini-prompt-from-video";
import { generatePromptWithClaude } from "@/lib/learn/claude-prompt";
import { generateImageFromPrompt } from "@/lib/learn/gemini-image";
import { startSoraGeneration, runSoraGeneration } from "@/lib/learn/sora-video-gen";
import { adaptPromptForVEO } from "@/lib/learn/adapt-for-veo";
import { snapshotCurrentVersion, computeTextDiff } from "@/lib/learn/prompt-versioning";
import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { updateJob } from "@/lib/learn/sync-jobs";

export async function adaptPromptForVEOAction(sourceId: string, shrink = false) {
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false as const, error: "source not found" };
  if (!shrink) {
    return { ok: true as const, adapted: source.prompt, original: source.prompt };
  }
  try {
    const adapted = await adaptPromptForVEO(source.prompt, sourceId);
    return { ok: true as const, adapted, original: source.prompt };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e).slice(0, 200) };
  }
}

export async function deleteVideoAction(videoId: string, sourceId: string) {
  try {
    await prisma.generatedVideo.delete({ where: { id: videoId } });
    revalidatePath(`/learn/sources/${sourceId}`);
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e).slice(0, 200) };
  }
}

export async function generateVideoAction(
  sourceId: string,
  opts: { durationSec?: number; aspectRatio?: "16:9" | "9:16"; customPrompt?: string } = {},
) {
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false as const, error: "source not found" };
  const duration = opts.durationSec || 20;
  // Sora's prompt rewriter is more permissive than VEO's. We still run the
  // "adapt for VEO" step because it also trims / structures the prompt — the
  // output is perfectly usable as a Sora prompt.
  const finalPrompt = opts.customPrompt?.trim() || (await adaptPromptForVEO(source.prompt, sourceId));
  try {
    const videoId = await startSoraGeneration(finalPrompt, sourceId, {
      model: "sora-2", // per user directive: always regular Sora, never sora-2-pro
      durationSec: duration,
      aspectRatio: opts.aspectRatio || "16:9",
    });
    waitUntil(runSoraGeneration(videoId, finalPrompt).catch(() => {}));
    return { ok: true as const, videoId };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e).slice(0, 300) };
  }
}

export async function generateImageAction(sourceId: string, engine: "nano-banana" | "imagen-4" = "nano-banana") {
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false as const, error: "source not found" };
  try {
    const { blobUrl, usdCost } = await generateImageFromPrompt(source.prompt, sourceId, engine);
    // Save the generated image as the source thumbnail if it doesn't have one
    await prisma.learnSource.update({
      where: { id: sourceId },
      data: { thumbnail: blobUrl },
    });
    revalidatePath(`/learn/sources/${sourceId}`);
    return { ok: true as const, imageUrl: blobUrl, cost: usdCost };
  } catch (e: any) {
    return { ok: false as const, error: String(e.message || e).slice(0, 300) };
  }
}

function isQuotaError(e: any): boolean {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("expired") || msg.includes("403");
}

// Retry analysis for a failed source. Re-fetches caption/thumbnail from the original
// Instagram URL if available, then tries Gemini video → Claude fallback.
export async function retryAnalysisAction(sourceId: string) {
  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false as const, error: "source not found" };
  if (!source.blobUrl) return { ok: false as const, error: "אין video URL לניתוח" };

  await prisma.learnSource.update({
    where: { id: sourceId },
    data: { status: "processing", error: null },
  });

  // Re-fetch Instagram caption + thumbnail if URL is an IG reel
  let caption: string | null = null;
  let thumbnail: string | null = source.thumbnail;
  if (source.url && /instagram\.com/.test(source.url)) {
    try {
      const ig = await extractInstagram(source.url);
      caption = ig.caption;
      if (!thumbnail) thumbnail = ig.thumbnail;
    } catch {
      // ignore, work with what we have
    }
  }

  let analyzed;
  let engine = "gemini-video";
  try {
    analyzed = await extractPromptFromVideo(source.blobUrl, caption || source.prompt);
  } catch (e: any) {
    if (isQuotaError(e)) {
      try {
        analyzed = await generatePromptWithClaude(caption || source.prompt, thumbnail);
        engine = "claude-fallback";
      } catch (e2: any) {
        await prisma.learnSource.update({
          where: { id: sourceId },
          data: { status: "failed", error: `רטריי נכשל: Gemini quota + Claude: ${String(e2.message || e2).slice(0, 200)}` },
        });
        return { ok: false as const, error: `שני המנועים נכשלו. נסה שוב מאוחר יותר או enable billing ב-Gemini.` };
      }
    } else {
      await prisma.learnSource.update({
        where: { id: sourceId },
        data: { status: "failed", error: String(e.message || e).slice(0, 500) },
      });
      return { ok: false as const, error: String(e.message || e).slice(0, 200) };
    }
  }

  // Snapshot the current state BEFORE overwriting anything
  const retryVersion = await snapshotCurrentVersion(sourceId, "retry-analysis", "רטריי של ניתוח אחרי כשל");
  const retryVersionRow = await prisma.promptVersion.findFirst({
    where: { sourceId, version: retryVersion },
    select: { id: true },
  });
  if (retryVersionRow) {
    await Promise.all([
      prisma.generatedVideo.updateMany({
        where: { sourceId, promptVersionId: null },
        data: { promptVersionId: retryVersionRow.id },
      }),
      prisma.generatedImage.updateMany({
        where: { sourceId, promptVersionId: null },
        data: { promptVersionId: retryVersionRow.id },
      }),
    ]);
  }

  // Save analysis + knowledge nodes
  // Remove existing analysis if any
  await prisma.videoAnalysis.deleteMany({ where: { sourceId } });

  const analysis = await prisma.videoAnalysis.create({
    data: {
      sourceId,
      description: analyzed.captionEnglish || analyzed.generatedPrompt.slice(0, 300),
      techniques: analyzed.techniques,
      howTo: [],
      tags: analyzed.tags,
      style: analyzed.style,
      mood: analyzed.mood,
      difficulty: null,
      insights: [],
      promptAlignment: null,
      rawGemini: JSON.stringify({ engine, ...analyzed }),
    },
  });

  const nodes = analyzed.techniques.map((t: string) => ({
    type: "technique",
    title: t.slice(0, 120),
    body: t,
    tags: [...analyzed.tags, analyzed.style || ""].filter(Boolean),
    confidence: 0.85,
    analysisId: analysis.id,
  }));
  if (nodes.length > 0) await prisma.knowledgeNode.createMany({ data: nodes });

  await prisma.learnSource.update({
    where: { id: sourceId },
    data: {
      prompt: analyzed.generatedPrompt,
      title: analyzed.title || source.title,
      thumbnail: thumbnail || source.thumbnail,
      status: "complete",
      error: null,
    },
  });

  revalidatePath(`/learn/sources/${sourceId}`);
  revalidatePath("/learn/sources");
  return { ok: true as const, engine, title: analyzed.title };
}

// Re-pull the source URL and run a fresh analysis with the current (improved) prompt strategy.
// The previous prompt is snapshotted to PromptVersion so the user can see the diff.
// Designed to run inside `waitUntil` from a SyncJob route — every step calls updateJob.
export async function regenerateFromUrl(sourceId: string, jobId?: string): Promise<{
  ok: boolean;
  newVersion?: number;
  diff?: any;
  error?: string;
}> {
  const tick = async (step: string, msg?: string, completed?: number, total?: number) => {
    if (jobId) await updateJob(jobId, { currentStep: step, currentMessage: msg, ...(completed != null ? { completedItems: completed } : {}), ...(total != null ? { totalItems: total } : {}) });
  };

  const source = await prisma.learnSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, error: "source not found" };
  if (!source.url) return { ok: false, error: "אין URL מקור — אי אפשר לשחזר" };

  await tick("שומר גרסה קודמת", `שומר את הפרומפט הנוכחי כ-snapshot`, 0, 4);
  const oldPrompt = source.prompt;
  const newVersion = await snapshotCurrentVersion(sourceId, "regenerate-from-url", "regenerated from source URL");
  // Find the freshly-created PromptVersion id so we can link existing media to it.
  const freshVersionRow = await prisma.promptVersion.findFirst({
    where: { sourceId, version: newVersion },
    select: { id: true },
  });
  if (freshVersionRow) {
    // Tag every existing video/image as "belonging to the previous prompt version"
    await Promise.all([
      prisma.generatedVideo.updateMany({
        where: { sourceId, promptVersionId: null },
        data: { promptVersionId: freshVersionRow.id },
      }),
      prisma.generatedImage.updateMany({
        where: { sourceId, promptVersionId: null },
        data: { promptVersionId: freshVersionRow.id },
      }),
    ]);
  }

  await tick("מושך כיתוב + תמונה מהמקור", source.url, 1, 4);
  let caption: string | null = null;
  let thumbnail: string | null = source.thumbnail;
  try {
    if (/instagram\.com/.test(source.url)) {
      const ig = await extractInstagram(source.url);
      caption = ig.caption;
      if (ig.thumbnail) thumbnail = ig.thumbnail;
    } else {
      // Non-IG URL — for now we just reuse existing prompt as the "caption". Future: add other extractors.
      caption = oldPrompt.slice(0, 1500);
    }
  } catch (e: any) {
    return { ok: false, error: `מיצוי נכשל: ${String(e.message || e).slice(0, 200)}` };
  }
  if (!caption && !thumbnail) {
    return { ok: false, error: "לא הצלחתי לחלץ כיתוב או תמונה — נסה שוב מאוחר יותר" };
  }

  await tick("Gemini בונה פרומפט חדש", "ניתוח caption-first multi-scene", 2, 4);
  let analyzed;
  try {
    analyzed = await generatePromptWithClaude(caption, thumbnail);
  } catch (e: any) {
    return { ok: false, error: `Gemini נכשל: ${String(e.message || e).slice(0, 200)}` };
  }

  await tick("שומר ומחשב diff", "מחליף analysis ומחשב הבדלים", 3, 4);
  const diff = computeTextDiff(oldPrompt, analyzed.generatedPrompt);

  // Update PromptVersion with the diff (so the log shows +/- stats)
  const latest = await prisma.promptVersion.findFirst({
    where: { sourceId, version: newVersion },
  });
  if (latest) {
    await prisma.promptVersion.update({
      where: { id: latest.id },
      data: { diff: diff as any },
    });
  }

  // Replace analysis + knowledge nodes
  await prisma.videoAnalysis.deleteMany({ where: { sourceId } });
  const analysis = await prisma.videoAnalysis.create({
    data: {
      sourceId,
      description: analyzed.captionEnglish || analyzed.generatedPrompt.slice(0, 300),
      techniques: analyzed.techniques,
      howTo: [],
      tags: analyzed.tags,
      style: analyzed.style,
      mood: analyzed.mood,
      difficulty: null,
      insights: [],
      promptAlignment: null,
      rawGemini: JSON.stringify({ engine: "regenerate-from-url", ...analyzed }),
    },
  });
  const nodes = analyzed.techniques.map((t: string) => ({
    type: "technique",
    title: t.slice(0, 120),
    body: t,
    tags: [...analyzed.tags, analyzed.style || ""].filter(Boolean),
    confidence: 0.85,
    analysisId: analysis.id,
  }));
  if (nodes.length > 0) await prisma.knowledgeNode.createMany({ data: nodes });

  await prisma.learnSource.update({
    where: { id: sourceId },
    data: {
      prompt: analyzed.generatedPrompt,
      title: analyzed.title || source.title,
      thumbnail: thumbnail || source.thumbnail,
      status: "complete",
      error: null,
    },
  });

  await tick("הושלם", `גרסה v${newVersion} נשמרה`, 4, 4);
  revalidatePath(`/learn/sources/${sourceId}`);
  return { ok: true, newVersion, diff };
}
