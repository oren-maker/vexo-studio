// Central pricing + usage logging. Every API call should record to ApiUsage.

import { prisma } from "./db";

// Pricing (USD per million tokens, except images which are per-image)
// Updated 2026-04. Adjust as providers change rates.
export const PRICING = {
  "gemini-3-flash-preview": {
    engine: "gemini" as const,
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    imagePer: 0,
  },
  "gemini-flash-latest": {
    engine: "gemini" as const,
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    imagePer: 0,
  },
  "gemini-2.5-flash": {
    engine: "gemini" as const,
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    imagePer: 0,
  },
  "gemini-2.5-flash-image": {
    engine: "gemini-image" as const,
    inputPer1M: 0.30,
    outputPer1M: 0,
    imagePer: 0.039, // nano-banana: ~$0.039 per image output
  },
  "gemini-2.5-flash-image-preview": {
    engine: "gemini-image" as const,
    inputPer1M: 0.30,
    outputPer1M: 0,
    imagePer: 0.039,
  },
  "claude-haiku-4-5-20251001": {
    engine: "claude" as const,
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    imagePer: 0,
  },
  "claude-sonnet-4-6": {
    engine: "claude" as const,
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    imagePer: 0,
  },
  "veo-3.1-generate-preview": {
    engine: "gemini-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.75,
  },
  "veo-3.1-fast-generate-preview": {
    engine: "gemini-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.40,
  },
  "veo-3.1-lite-generate-preview": {
    engine: "gemini-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.15,
  },
  "veo-3.0-generate-001": {
    engine: "gemini-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.75,
  },
  "veo-3.0-fast-generate-001": {
    engine: "gemini-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.40,
  },
  // OpenAI Sora 2 — videos created via lib/learn/sora-video-gen.
  // engine="openai-video" so the Wallets dashboard shows them under OpenAI,
  // not lumped with Gemini.
  "sora-2": {
    engine: "openai-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.10,
  },
  "sora-2-pro": {
    engine: "openai-video" as const,
    inputPer1M: 0,
    outputPer1M: 0,
    imagePer: 0,
    secondPerUsd: 0.30,
  },
} as const;

export type ModelKey = keyof typeof PRICING;
export type Operation =
  | "compose"
  | "improve"
  | "video-analysis"
  | "video-gen"
  | "image-gen"
  | "knowledge-extract"
  | "translate"
  | "reference-search"
  | "image-prompt-build"
  | "brain-chat"
  | "insights-snapshot";

export function calcCost(model: string, inputTokens: number, outputTokens: number, imagesOut: number, videoSeconds = 0): number {
  const p = (PRICING as any)[model];
  if (!p) return 0;
  const inputCost = (inputTokens / 1_000_000) * p.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * p.outputPer1M;
  const imageCost = imagesOut * p.imagePer;
  const videoCost = videoSeconds * (p.secondPerUsd || 0);
  return Math.round((inputCost + outputCost + imageCost + videoCost) * 1_000_000) / 1_000_000;
}

// Last-resort engine inference when the model isn't in PRICING.
// Keeps brand-new models from polluting the dashboard with "unknown".
function inferEngineFromModel(model: string): string {
  const m = (model || "").toLowerCase();
  if (m.includes("veo") || m.includes("imagen-video")) return "gemini-video";
  if (m.includes("sora")) return "openai-video";
  if (m.includes("image") || m.includes("nano-banana") || m.includes("imagen")) return "gemini-image";
  if (m.includes("gemini") || m.includes("bison") || m.includes("flash")) return "gemini";
  if (m.includes("claude") || m.includes("haiku") || m.includes("sonnet") || m.includes("opus")) return "claude";
  if (m.includes("gpt") || m.includes("o1") || m.startsWith("text-")) return "openai";
  if (m.includes("eleven")) return "elevenlabs";
  if (m.includes("luma") || m.includes("ray")) return "luma";
  if (m.includes("fal") || m.includes("seedance") || m.includes("kling") || m.includes("vidu")) return "fal";
  return "other"; // last resort — never "unknown" again
}

export async function logUsage(params: {
  model: string;
  operation: Operation;
  inputTokens?: number;
  outputTokens?: number;
  imagesOut?: number;
  videoSeconds?: number;
  sourceId?: string;
  errored?: boolean;
  meta?: Record<string, any>;
}): Promise<void> {
  const pricing = (PRICING as any)[params.model];
  const engine = pricing?.engine || inferEngineFromModel(params.model);
  const usdCost = calcCost(
    params.model,
    params.inputTokens || 0,
    params.outputTokens || 0,
    params.imagesOut || 0,
    params.videoSeconds || 0,
  );
  try {
    await prisma.apiUsage.create({
      data: {
        engine,
        model: params.model,
        operation: params.operation,
        inputTokens: params.inputTokens || 0,
        outputTokens: params.outputTokens || 0,
        imagesOut: params.imagesOut || 0,
        videoSeconds: params.videoSeconds || 0,
        usdCost,
        sourceId: params.sourceId || null,
        errored: !!params.errored,
        meta: params.meta || undefined,
      },
    });
  } catch {
    // Don't let logging failure break the API call
  }
}

// Convenience helper to wrap an async API call with usage logging.
// Takes a function that returns { result, usage } and logs automatically.
export async function trackUsage<T>(
  operation: Operation,
  model: string,
  sourceId: string | undefined,
  fn: () => Promise<{ result: T; inputTokens?: number; outputTokens?: number; imagesOut?: number; videoSeconds?: number; meta?: any }>,
): Promise<T> {
  try {
    const r = await fn();
    await logUsage({
      model,
      operation,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      imagesOut: r.imagesOut,
      videoSeconds: r.videoSeconds,
      sourceId,
      meta: r.meta,
    });
    return r.result;
  } catch (e: any) {
    await logUsage({
      model,
      operation,
      sourceId,
      errored: true,
      meta: { error: String(e.message || e).slice(0, 200) },
    });
    throw e;
  }
}
