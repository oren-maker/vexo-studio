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
