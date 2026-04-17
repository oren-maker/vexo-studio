/**
 * Higgsfield Cloud API — image-to-video + text-to-video.
 *
 * Docs: https://docs.higgsfield.ai/
 * Base: https://platform.higgsfield.ai
 * Auth: Key {API_KEY_ID}:{API_KEY_SECRET}
 *
 * Submit:  POST /{model_path}  → { request_id }
 * Poll:    GET  /requests/{request_id}/status → { status, video: { url } }
 * Cancel:  POST /requests/{request_id}/cancel
 *
 * Models:
 *   higgsfield-ai/dop/preview         — Higgsfield DOP Preview (fast)
 *   higgsfield-ai/dop/standard        — Higgsfield DOP Standard (quality)
 *   bytedance/seedance/v1/pro/image-to-video  — Seedance via Higgsfield
 *   kling-video/v2.1/pro/image-to-video       — Kling via Higgsfield
 */

const BASE = "https://platform.higgsfield.ai";

export type HiggsModel =
  | "higgsfield-ai/dop/preview"
  | "higgsfield-ai/dop/standard"
  | "bytedance/seedance/v1/pro/image-to-video"
  | "kling-video/v2.1/pro/image-to-video";

function authHeader(): string {
  const id = (process.env.HIGGSFIELD_API_ID ?? "").trim();
  const secret = (process.env.HIGGSFIELD_API_KEY ?? "").trim();
  if (!id || !secret) throw new Error("HIGGSFIELD_API_ID and HIGGSFIELD_API_KEY must be set");
  return `Key ${id}:${secret}`;
}

export async function submitHiggsVideo(opts: {
  prompt: string;
  model?: HiggsModel;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  imageUrl?: string;
}): Promise<{ id: string; status: string }> {
  const model = opts.model ?? "higgsfield-ai/dop/standard";
  const body: Record<string, unknown> = {
    prompt: opts.prompt.slice(0, 2000),
    duration: opts.durationSeconds ?? 20,
    aspect_ratio: opts.aspectRatio ?? "16:9",
  };
  if (opts.imageUrl) body.image_url = opts.imageUrl;

  const res = await fetch(`${BASE}/${model}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield submit ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  return {
    id: data.request_id ?? data.id ?? "",
    status: data.status ?? "queued",
  };
}

export async function pollHiggsVideo(requestId: string): Promise<{
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw";
  progress?: number;
  videoUrl?: string;
  error?: string;
}> {
  const res = await fetch(`${BASE}/requests/${requestId}/status`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(`Higgsfield poll ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  return {
    status: data.status ?? "in_progress",
    progress: data.progress ?? undefined,
    videoUrl: data.video?.url ?? undefined,
    error: data.status === "nsfw" ? "Content flagged as NSFW" : (data.error ?? undefined),
  };
}

export const HIGGS_PRICING: Record<string, number> = {
  "higgsfield-ai/dop/preview": 0.04,
  "higgsfield-ai/dop/standard": 0.05,
  "bytedance/seedance/v1/pro/image-to-video": 0.06,
  "kling-video/v2.1/pro/image-to-video": 0.06,
};

export function priceHiggs(model: string, seconds: number): number {
  const rate = HIGGS_PRICING[model] ?? 0.05;
  return +(rate * seconds).toFixed(4);
}
