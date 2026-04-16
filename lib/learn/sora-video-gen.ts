// OpenAI Sora 2 generation for the /learn/sources flow.
// Mirrors the VEO runner shape (startSoraGeneration + runSoraGeneration) so
// the existing GeneratedVideo row + progress-polling UI keep working.

import { put } from "@vercel/blob";
import { prisma } from "./db";
import { logUsage } from "./usage-tracker";
import { generateImageFromPrompt } from "./gemini-image";
import { submitSoraVideo, pollSoraVideo, downloadSoraVideo, SORA_PRICING, type SoraModel, type SoraSeconds, type SoraSize } from "@/lib/providers/openai-sora";

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

export async function startSoraGeneration(
  prompt: string,
  sourceId: string,
  opts: { model?: SoraModel; durationSec?: number; aspectRatio?: "16:9" | "9:16" } = {},
): Promise<string> {
  const model = opts.model || "sora-2"; // user directive: never use sora-2-pro
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
      progressMessage: "שולח ל-Sora 2…",
    },
  });
  return row.id;
}

function aspectToSize(aspect: string): SoraSize {
  return aspect === "9:16" ? "720x1280" : "1280x720";
}

function roundToAllowedSeconds(sec: number): SoraSeconds {
  if (sec <= 4) return "4";
  if (sec <= 8) return "8";
  if (sec <= 12) return "12";
  if (sec <= 16) return "16";
  return "20";
}

export async function runSoraGeneration(videoId: string, prompt: string): Promise<void> {
  const row = await prisma.generatedVideo.findUnique({ where: { id: videoId } });
  if (!row) return;

  const source = await prisma.learnSource.findUnique({ where: { id: row.sourceId } });
  const model = row.model as SoraModel;
  const duration = row.durationSec;
  const aspect = row.aspectRatio as "16:9" | "9:16";
  const seconds = roundToAllowedSeconds(duration);
  const size = aspectToSize(aspect);
  const usdCost = +(SORA_PRICING[model] * Number(seconds)).toFixed(4);

  try {
    await updateProgress(videoId, { status: "submitting", progressPct: 8, progressMessage: "שולח בקשה ל-Sora 2…" });

    const refImage = source?.thumbnail || undefined;
    const submission = await submitSoraVideo({
      model,
      prompt: prompt.slice(0, 2000),
      seconds,
      size,
      imageUrl: refImage,
    });

    await updateProgress(videoId, {
      status: "rendering",
      progressPct: 18,
      progressMessage: `Sora 2 בתור… id=${submission.id.slice(-8)}`,
      operationId: submission.id,
    });

    const startTime = Date.now();
    const deadline = startTime + 8 * 60 * 1000;
    let poll = await pollSoraVideo(submission.id);
    while (poll.status === "queued" || poll.status === "in_progress") {
      if (Date.now() > deadline) throw new Error("Sora polling timeout (8 דקות)");
      await new Promise((r) => setTimeout(r, 5000));
      poll = await pollSoraVideo(submission.id);
      const elapsed = (Date.now() - startTime) / 1000;
      const byProgress = typeof poll.progress === "number" ? poll.progress : null;
      const pct = byProgress != null ? Math.min(88, 18 + Math.round(byProgress * 0.7)) : Math.min(85, 18 + Math.round((elapsed / 120) * 67));
      await updateProgress(videoId, {
        status: "rendering",
        progressPct: pct,
        progressMessage: `${poll.status === "queued" ? "בתור" : "מרנדר"}… ${Math.round(elapsed)}s`,
      });
    }

    if (poll.status !== "completed") {
      throw new Error(`Sora status=${poll.status}${poll.error?.message ? ` · ${poll.error.message}` : ""}`);
    }

    await updateProgress(videoId, { status: "downloading", progressPct: 90, progressMessage: "מוריד את הוידאו מ-Sora…" });
    const { bytes, mimeType } = await downloadSoraVideo(submission.id);

    await updateProgress(videoId, { status: "uploading", progressPct: 95, progressMessage: "שומר ל-Blob…" });
    const filename = `prompt-videos/${row.sourceId}-sora-${Date.now()}.mp4`;
    const blob = await put(filename, bytes, { access: "public", contentType: mimeType || "video/mp4" });

    await prisma.generatedVideo.update({
      where: { id: videoId },
      data: {
        blobUrl: blob.url,
        usdCost,
        status: "complete",
        progressPct: 100,
        progressMessage: "הושלם ✓",
      },
    });

    await logUsage({
      model,
      operation: "video-gen",
      inputTokens: Math.round(prompt.length / 4),
      outputTokens: 0,
      imagesOut: 0,
      sourceId: row.sourceId,
      meta: { engine: "openai-sora", seconds, size, byteSize: bytes.length },
      usdCost,
    });
  } catch (e: any) {
    await updateProgress(videoId, {
      status: "failed",
      progressPct: 0,
      progressMessage: null,
      error: String(e?.message || e).slice(0, 500),
    });
    await logUsage({
      model,
      operation: "video-gen",
      sourceId: row.sourceId,
      errored: true,
      meta: { engine: "openai-sora", error: String(e?.message || e).slice(0, 200) },
    });
  }
}
