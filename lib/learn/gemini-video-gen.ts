// VEO 3 video generation. NEW FLOW:
// 1. If source has no image → generate one with nano-banana first
// 2. Animate the image with VEO 3 using the full prompt as motion/style brief

import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";
import { logUsage } from "./usage-tracker";
import { prisma } from "./db";
import { generateImageFromPrompt } from "./gemini-image";

const API_KEY = process.env.GEMINI_API_KEY;

const VEO_PRICING = {
  "veo-3.1-generate-preview": 0.75,
  "veo-3.1-fast-generate-preview": 0.40,
  "veo-3.1-lite-generate-preview": 0.15,
  "veo-3.0-generate-001": 0.75,
  "veo-3.0-fast-generate-001": 0.40,
} as const;

export type VeoModel = keyof typeof VEO_PRICING;

async function updateProgress(videoId: string, data: {
  status?: string;
  progressPct?: number;
  progressMessage?: string;
  operationId?: string | null;
  error?: string;
}) {
  try {
    await prisma.generatedVideo.update({ where: { id: videoId }, data });
  } catch {}
}

export async function startVideoGeneration(
  prompt: string,
  sourceId: string,
  opts: { model?: VeoModel; durationSec?: number; aspectRatio?: "16:9" | "9:16" } = {},
): Promise<string> {
  const model = opts.model || "veo-3.1-fast-generate-preview";
  const duration = opts.durationSec || 8;
  const aspect = opts.aspectRatio || "16:9";

  const row = await prisma.generatedVideo.create({
    data: {
      sourceId,
      blobUrl: "",
      model,
      usdCost: 0,
      durationSec: duration,
      aspectRatio: aspect,
      promptHead: prompt.slice(0, 200),
      status: "submitting",
      progressPct: 2,
      progressMessage: "מכין את הבקשה…",
    },
  });

  return row.id;
}

// Fetch image bytes from URL + convert to base64 for VEO's image param
async function fetchImageAsBase64(url: string): Promise<{ bytesBase64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  const contentType = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytesBase64: buf.toString("base64"), mimeType: contentType };
}

// When VEO blocks a prompt for safety, ask Gemini to rewrite it while preserving
// the cinematic intent. Strips violence/weapons/real-people/adult themes.
async function sanitizePromptForVeo(prompt: string): Promise<string> {
  if (!API_KEY) return prompt;
  const SYSTEM = `You rewrite cinematic video prompts to pass Google VEO safety filters. Preserve the visual style, mood, camera work, and scene structure — but:
- Replace weapons with training tools, replica, or metaphor ("sword"→"bamboo staff", "gun"→"camera"/"wand")
- Replace real people names with generic archetypes ("Elon Musk"→"a tech founder")
- Remove blood/gore/injury; replace with "intense moment"/"dramatic action"
- Remove anything involving children/minors — age up to "young adult"
- Remove nudity / explicit themes — dress the subject, implied tension only
- Remove brand names, logos, copyrighted characters

Output ONLY the rewritten prompt as one flowing text, same language as input, same length. No prefix, no quotes, no commentary.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `Rewrite this prompt for VEO safety:\n\n${prompt.slice(0, 3000)}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return prompt;
    const j: any = await res.json();
    const rewritten = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return rewritten && rewritten.length > 20 ? rewritten : prompt;
  } catch {
    return prompt;
  }
}

function isSafetyBlockError(err: any): boolean {
  const msg = String(err?.message || err).toLowerCase();
  return /safety|conflicted|rai[_ ]?media|filtered|block|content polic/i.test(msg);
}

export async function runVideoGeneration(videoId: string, prompt: string): Promise<void> {
  if (!API_KEY) {
    await updateProgress(videoId, { status: "failed", error: "GEMINI_API_KEY חסר", progressMessage: "מפתח Gemini חסר", progressPct: 0 });
    return;
  }

  const row = await prisma.generatedVideo.findUnique({ where: { id: videoId } });
  if (!row) return;
  const source = await prisma.learnSource.findUnique({
    where: { id: row.sourceId },
    include: { analysis: true },
  });

  const model = row.model as VeoModel;
  const duration = row.durationSec;
  const aspect = row.aspectRatio as "16:9" | "9:16";
  const usdCost = VEO_PRICING[model] * duration;

  try {
    // STEP 0: Ensure we have a reference image. Generate one first if missing.
    await updateProgress(videoId, { status: "submitting", progressPct: 3, progressMessage: "בודק תמונת reference…" });

    const existingImages = await prisma.generatedImage.findMany({
      where: { sourceId: row.sourceId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });

    let refImageUrl = source?.thumbnail || existingImages[0]?.blobUrl || null;
    let imageGenCost = 0;

    if (!refImageUrl) {
      await updateProgress(videoId, {
        status: "submitting",
        progressPct: 6,
        progressMessage: "יוצר תמונת reference עם nano-banana… (~$0.04)",
      });
      try {
        const imgResult = await generateImageFromPrompt(prompt, row.sourceId);
        refImageUrl = imgResult.blobUrl;
        imageGenCost = imgResult.usdCost;
        // Update source thumbnail so next time we reuse it
        await prisma.learnSource.update({
          where: { id: row.sourceId },
          data: { thumbnail: refImageUrl },
        }).catch(() => {});
      } catch (imgErr: any) {
        // Proceed without reference image if generation fails
        await updateProgress(videoId, {
          status: "submitting",
          progressPct: 10,
          progressMessage: "יצירת תמונה נכשלה — ממשיך בלי reference",
        });
      }
    }

    await updateProgress(videoId, {
      status: "submitting",
      progressPct: 12,
      progressMessage: refImageUrl ? "שולח לוידאו עם reference image…" : "שולח ל-VEO 3 (text-only)…",
    });

    const client = new GoogleGenAI({ apiKey: API_KEY });

    // Build the request. With an image, VEO animates it; without, text-to-video.
    const generateParams: any = {
      model,
      prompt: prompt.slice(0, 3000),
      config: { aspectRatio: aspect },
    };

    if (refImageUrl) {
      try {
        const { bytesBase64, mimeType } = await fetchImageAsBase64(refImageUrl);
        generateParams.image = { imageBytes: bytesBase64, mimeType };
      } catch {
        // Image fetch failed — proceed text-only
      }
    }

    // Light word-level strip for obvious triggers
    generateParams.prompt = generateParams.prompt
      .replace(/\b(child|kid|minor|underage|baby|toddler|infant)\b/gi, "adult")
      .replace(/\b(gore|gory|blood splatter|dismember|decapitat|graphic violence)\b/gi, "intense action")
      .slice(0, 3000);

    // Attempt with retry: if VEO rejects for safety, Gemini rewrites the prompt and we try once more.
    async function attemptGeneration(params: any, attemptLabel: string): Promise<any> {
      let operation: any = await client.models.generateVideos(params);
      await updateProgress(videoId, {
        status: "rendering",
        progressPct: 18,
        progressMessage: `${attemptLabel} · VEO 3 מרנדר… (1-3 דק׳)`,
        operationId: operation?.name || operation?.operation?.name || null,
      });
      const startTime = Date.now();
      const deadline = startTime + 5 * 60 * 1000;
      while (!operation.done) {
        if (Date.now() > deadline) throw new Error("VEO polling timeout (5 min)");
        await new Promise((r) => setTimeout(r, 6000));
        operation = await client.operations.getVideosOperation({ operation });
        const elapsed = (Date.now() - startTime) / 1000;
        const pct = Math.min(85, 18 + Math.round((elapsed / 120) * 67));
        await updateProgress(videoId, {
          status: "rendering",
          progressPct: pct,
          progressMessage: `${attemptLabel} · מרנדר… ${Math.round(elapsed)}s`,
        });
      }
      return operation;
    }

    function extractVideoRef(response: any) {
      const generated =
        response.generatedVideos?.[0] ||
        response.generated_videos?.[0] ||
        response.videos?.[0] ||
        response.candidates?.[0];
      return {
        generated,
        videoRef:
          generated?.video ||
          generated?.generatedVideo ||
          generated?.media ||
          generated?.content,
      };
    }

    function extractBlockReason(response: any, generated: any): { raiObj: any; reasonStr: string } {
      const rai =
        response.raiMediaFilteredReasons ||
        response.rai_media_filtered_reasons ||
        response.promptFeedback ||
        response.prompt_feedback ||
        generated?.raiMediaFilteredReasons ||
        generated?.finishReason ||
        generated?.finish_reason;
      const reasonStr = rai
        ? (typeof rai === "string" ? rai : JSON.stringify(rai).slice(0, 400))
        : `keys=${Object.keys(response).join(",")}`;
      return { raiObj: rai, reasonStr };
    }

    let operation: any = await attemptGeneration(generateParams, "ניסיון 1");
    let response: any = operation.response || {};
    let { generated, videoRef } = extractVideoRef(response);

    if (!videoRef) {
      const { raiObj, reasonStr } = extractBlockReason(response, generated);
      console.error("[veo] attempt 1 blocked", { videoId, reasonStr: reasonStr.slice(0, 300) });

      // If it's a safety block, auto-rewrite via Gemini and try once more.
      if (raiObj) {
        await updateProgress(videoId, {
          status: "submitting",
          progressPct: 14,
          progressMessage: "VEO חסם בטיחות — Gemini משכתב את הפרומפט…",
        });
        const sanitized = await sanitizePromptForVeo(generateParams.prompt);
        if (sanitized && sanitized !== generateParams.prompt) {
          const retryParams = { ...generateParams, prompt: sanitized.slice(0, 3000) };
          operation = await attemptGeneration(retryParams, "ניסיון 2 (פרומפט משוכתב)");
          response = operation.response || {};
          ({ generated, videoRef } = extractVideoRef(response));
        }
      }

      if (!videoRef) {
        const final = extractBlockReason(response, generated);
        throw new Error(`VEO לא החזיר וידאו אחרי 2 ניסיונות — ${final.raiObj ? "חסום ע״י סינון תוכן של Google" : "תשובה ריקה"}. ${final.reasonStr.slice(0, 200)}`);
      }
    }

    await updateProgress(videoId, { status: "downloading", progressPct: 88, progressMessage: "מוריד את הוידאו מ-VEO…" });

    const videoUri = (videoRef as any).uri || (videoRef as any).fileUri;
    if (!videoUri) throw new Error("VEO: video URI missing in response");
    const fetchUrl = videoUri.includes("?") ? `${videoUri}&key=${API_KEY}` : `${videoUri}?key=${API_KEY}`;
    const videoRes = await fetch(fetchUrl);
    if (!videoRes.ok) throw new Error(`VEO download ${videoRes.status}`);
    const buffer = Buffer.from(await videoRes.arrayBuffer());

    await updateProgress(videoId, { status: "uploading", progressPct: 95, progressMessage: "שומר ל-Blob…" });

    const filename = `prompt-videos/${row.sourceId}-${Date.now()}.mp4`;
    const blob = await put(filename, buffer, { access: "public", contentType: "video/mp4" });

    const finalCost = usdCost + imageGenCost;
    await prisma.generatedVideo.update({
      where: { id: videoId },
      data: {
        blobUrl: blob.url,
        usdCost: finalCost,
        status: "complete",
        progressPct: 100,
        progressMessage: "הושלם!",
        completedAt: new Date(),
      },
    });

    await logUsage({
      model,
      operation: "image-gen",
      inputTokens: Math.round(prompt.length / 4),
      videoSeconds: duration,
      sourceId: row.sourceId,
      meta: { aspect, videoGeneration: true, blobUrl: blob.url, usdCost: finalCost, videoId, usedReferenceImage: !!refImageUrl, imageGenCost },
    });
  } catch (e: any) {
    const msg = String(e.message || e).slice(0, 500);
    await prisma.generatedVideo.update({
      where: { id: videoId },
      data: { status: "failed", error: msg, progressMessage: msg.slice(0, 120), progressPct: 0 },
    }).catch(() => {});
    await logUsage({
      model,
      operation: "image-gen",
      videoSeconds: duration,
      sourceId: row.sourceId,
      errored: true,
      meta: { error: msg, videoId },
    }).catch(() => {});
  }
}

export function estimateVeoCost(model: VeoModel, durationSec: number): number {
  return VEO_PRICING[model] * durationSec;
}
