/**
 * fal.ai adapter
 *
 * Models:
 *  - IMAGE:           fal-ai/nano-banana                                (Google Gemini 2.5 Flash Image)
 *  - VIDEO (default): fal-ai/bytedance/seedance/v1/pro/text-to-video    (SeeDance Pro)
 *  - VIDEO (alt):     fal-ai/kling-video/v2.1/master/text-to-video      (Kling 2.1 Master)
 *
 * Endpoints:
 *  - Sync run:  POST  https://fal.run/<model>                  (image — fast)
 *  - Queue run: POST  https://queue.fal.run/<model>            (video — 30-120s)
 *  - Status:    GET   https://queue.fal.run/<model>/requests/<id>/status
 *  - Result:    GET   https://queue.fal.run/<model>/requests/<id>
 */

const FAL_RUN = "https://fal.run";
const FAL_QUEUE = "https://queue.fal.run";

export type ImageModel = "nano-banana";
export type VideoModel = "seedance" | "kling";

const IMAGE_MODELS: Record<ImageModel, string> = {
  "nano-banana": "fal-ai/nano-banana",
};

const VIDEO_MODELS: Record<VideoModel, string> = {
  seedance: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
  kling:    "fal-ai/kling-video/v2.1/master/text-to-video",
};

function key(): string {
  const k = process.env.FAL_API_KEY;
  if (!k) throw new Error("FAL_API_KEY not set");
  return k;
}

function headers(): Record<string, string> {
  return { Authorization: `Key ${key()}`, "Content-Type": "application/json" };
}

// ---------------------------------------------------------------------------
// IMAGE — sync, returns first image URL
// ---------------------------------------------------------------------------
export interface ImageResult {
  imageUrl: string;
  raw: unknown;
}

export async function generateImage(opts: { prompt: string; negativePrompt?: string; aspectRatio?: "1:1" | "16:9" | "9:16"; model?: ImageModel }): Promise<ImageResult> {
  const model = IMAGE_MODELS[opts.model ?? "nano-banana"];
  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    num_images: 1,
    output_format: "jpeg",
  };
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.negativePrompt) body.negative_prompt = opts.negativePrompt;

  const res = await fetch(`${FAL_RUN}/${model}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`fal image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const url = data?.images?.[0]?.url ?? data?.image?.url ?? data?.url;
  if (!url) throw new Error(`fal image: missing URL in ${JSON.stringify(data).slice(0, 200)}`);
  return { imageUrl: url, raw: data };
}

// ---------------------------------------------------------------------------
// VIDEO — queue, returns requestId. Caller polls or receives webhook.
// ---------------------------------------------------------------------------
export interface VideoSubmitResult {
  requestId: string;
  statusUrl: string;
  resultUrl: string;
  model: string;
}

export async function submitVideo(opts: {
  prompt: string;
  model?: VideoModel;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  webhookUrl?: string;
}): Promise<VideoSubmitResult> {
  const model = VIDEO_MODELS[opts.model ?? "seedance"];
  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    duration: String(Math.max(3, Math.min(opts.durationSeconds ?? 5, 10))),
    aspect_ratio: opts.aspectRatio ?? "16:9",
  };

  const url = opts.webhookUrl
    ? `${FAL_QUEUE}/${model}?fal_webhook=${encodeURIComponent(opts.webhookUrl)}`
    : `${FAL_QUEUE}/${model}`;

  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`fal video submit ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const id = data?.request_id ?? data?.requestId;
  if (!id) throw new Error(`fal video: missing request_id in ${JSON.stringify(data).slice(0, 200)}`);
  return {
    requestId: id,
    statusUrl: data?.status_url ?? `${FAL_QUEUE}/${model}/requests/${id}/status`,
    resultUrl: data?.response_url ?? `${FAL_QUEUE}/${model}/requests/${id}`,
    model,
  };
}

export async function videoStatus(model: string, requestId: string): Promise<{ status: string; logs?: unknown[] }> {
  const res = await fetch(`${FAL_QUEUE}/${model}/requests/${requestId}/status?logs=1`, { headers: headers() });
  if (!res.ok) throw new Error(`fal video status ${res.status}`);
  return res.json();
}

export async function videoResult(model: string, requestId: string): Promise<{ videoUrl?: string; raw: unknown }> {
  const res = await fetch(`${FAL_QUEUE}/${model}/requests/${requestId}`, { headers: headers() });
  if (!res.ok) throw new Error(`fal video result ${res.status}`);
  const data = await res.json();
  const videoUrl = data?.video?.url ?? data?.output?.video?.url;
  return { videoUrl, raw: data };
}

export const FAL_MODELS = { IMAGE_MODELS, VIDEO_MODELS };

// ---------------------------------------------------------------------------
// PRICING (USD per generation). Update as fal changes prices.
// ---------------------------------------------------------------------------
export const FAL_PRICING_USD = {
  // Image: per image
  "nano-banana": 0.039,

  // Video: per second of output
  // SeeDance Pro: ~$0.62 / 5s @ 1080p → ~$0.124 per second
  seedance: { perSecond: 0.124 },
  // Kling 2.1 Master: ~$0.28 / 5s @ 720p → ~$0.056 per second
  kling: { perSecond: 0.056 },
} as const;

export function priceImage(model: ImageModel = "nano-banana", count = 1): number {
  return (FAL_PRICING_USD[model] ?? 0) * count;
}
export function priceVideo(model: VideoModel = "seedance", durationSeconds = 5): number {
  const m = FAL_PRICING_USD[model];
  if (!m || typeof m !== "object") return 0;
  return m.perSecond * durationSeconds;
}

// ---------------------------------------------------------------------------
// BALANCE — query fal.ai user balance + usage. Endpoint may evolve.
// ---------------------------------------------------------------------------
export interface FalBalance {
  currentBalance?: number;       // remaining USD
  expiringSoon?: number;         // USD expiring within 365d
  usageThisMonth?: number;       // USD spent in current calendar month
  source: string;                // which endpoint succeeded
  raw: unknown;
}

const BALANCE_ENDPOINTS = [
  "https://rest.alpha.fal.ai/billing/user_balance",
  "https://api.fal.ai/billing/user_balance",
  "https://api.fal.ai/v1/billing/balance",
];

export async function fetchBalance(): Promise<FalBalance> {
  let lastErr: unknown;
  for (const url of BALANCE_ENDPOINTS) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Key ${key()}` } });
      if (!res.ok) { lastErr = `${url} ${res.status}`; continue; }
      const data = await res.json();
      // Various shapes seen across fal API versions:
      const b = data?.user_balance ?? data?.current_balance ?? data?.balance ?? data?.available ?? data?.remaining ?? data?.amount ?? data?.usd;
      const exp = data?.expiring_soon ?? data?.expiring ?? data?.credits_expiring_in_365_days ?? data?.expiring_credits;
      const usage = data?.usage_this_month ?? data?.usage_month ?? data?.month_usage ?? data?.this_month_usage ?? data?.month_to_date;
      return {
        currentBalance: typeof b === "number" ? b : undefined,
        expiringSoon: typeof exp === "number" ? exp : undefined,
        usageThisMonth: typeof usage === "number" ? usage : undefined,
        source: url,
        raw: data,
      };
    } catch (e) { lastErr = e; }
  }
  throw new Error(`fal balance: all endpoints failed (${String(lastErr).slice(0, 200)})`);
}
