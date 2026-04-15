/**
 * Google Gemini API — direct VEO integration (no fal in the middle).
 * Requires GEMINI_API_KEY (same key used for text). The video files Google
 * returns are auth-gated URIs; use downloadVeoVideo() to fetch them server-side.
 *
 * Models available as of 2026-04:
 *   veo-2.0-generate-001
 *   veo-3.0-generate-001        (Pro)
 *   veo-3.0-fast-generate-001   (Fast)
 *   veo-3.1-generate-preview    (Pro, reference images)
 *   veo-3.1-fast-generate-preview (Fast, reference images)
 *   veo-3.1-lite-generate-preview
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GoogleVeoModel =
  | "veo-3.0-fast-generate-001"
  | "veo-3.0-generate-001"
  | "veo-3.1-fast-generate-preview"
  | "veo-3.1-generate-preview"
  | "veo-3.1-lite-generate-preview";

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY not set");
  return k;
}

export interface VeoSubmitOptions {
  prompt: string;
  model: GoogleVeoModel;
  /** 4 / 6 / 8 for VEO 3.x; up to 8 for 3.0. */
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** For i2v: one starting image (URL fetched server-side → base64). */
  imageUrl?: string;
  /** VEO 3.1 only: up to 3 reference subject images for identity lock. */
  referenceImageUrls?: string[];
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reference image fetch ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = await res.arrayBuffer();
  const data = Buffer.from(buf).toString("base64");
  return { data, mimeType };
}

export interface VeoSubmitResult {
  operationName: string;
  model: GoogleVeoModel;
}

export async function submitVeoVideo(opts: VeoSubmitOptions): Promise<VeoSubmitResult> {
  const rawSec = Math.max(1, Math.min(opts.durationSeconds ?? 8, 8));

  // Reference images only supported on VEO 3.1 models
  const supportsReferenceImages = opts.model.startsWith("veo-3.1");

  const instance: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.imageUrl) {
    const { data, mimeType } = await urlToBase64(opts.imageUrl);
    instance.image = { imageBytes: data, mimeType };
  }
  if (supportsReferenceImages && opts.referenceImageUrls && opts.referenceImageUrls.length > 0) {
    const refs = await Promise.all(opts.referenceImageUrls.slice(0, 3).map(async (u) => {
      const { data, mimeType } = await urlToBase64(u);
      return { image: { imageBytes: data, mimeType }, referenceType: "asset" };
    }));
    instance.referenceImages = refs;
  }

  const body = {
    instances: [instance],
    parameters: {
      aspectRatio: opts.aspectRatio ?? "16:9",
      durationSeconds: rawSec,
      personGeneration: "allow_all" as const,
    },
  };

  const res = await fetch(`${BASE}/models/${opts.model}:predictLongRunning?key=${key()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`VEO submit ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  const operationName: string | undefined = data?.name;
  if (!operationName) throw new Error(`VEO submit: missing operation name in ${JSON.stringify(data).slice(0, 200)}`);
  return { operationName, model: opts.model };
}

export interface VeoPollResult {
  done: boolean;
  videoUri?: string;
  error?: string;
}

export async function pollVeoOperation(operationName: string): Promise<VeoPollResult> {
  const res = await fetch(`${BASE}/${operationName}?key=${key()}`);
  if (!res.ok) throw new Error(`VEO poll ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.done) return { done: false };
  if (data.error) return { done: true, error: data.error.message ?? JSON.stringify(data.error) };
  const uri: string | undefined = data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) return { done: true, error: `no video in response: ${JSON.stringify(data).slice(0, 300)}` };
  return { done: true, videoUri: uri };
}

/**
 * Fetch the Google-hosted video file as a Node Response. The URI requires the
 * API key appended to reach the file. We read it into a buffer and let the
 * caller do whatever (upload to our CDN, stream to client, save to blob store).
 */
export async function downloadVeoVideo(videoUri: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const sep = videoUri.includes("?") ? "&" : "?";
  const res = await fetch(`${videoUri}${sep}key=${key()}`);
  if (!res.ok) throw new Error(`VEO download ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "video/mp4";
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytes: buf, mimeType };
}

/** Rough pricing estimate, USD per second (Google Cloud public prices Apr 2026). */
export const GOOGLE_VEO_PRICING: Record<GoogleVeoModel, number> = {
  "veo-3.0-generate-001":           0.50,
  "veo-3.0-fast-generate-001":      0.35,
  "veo-3.1-generate-preview":       0.50,
  "veo-3.1-fast-generate-preview":  0.35,
  "veo-3.1-lite-generate-preview":  0.20,
};

export function priceVeoVideo(model: GoogleVeoModel, durationSeconds: number): number {
  return +(GOOGLE_VEO_PRICING[model] * durationSeconds).toFixed(4);
}
