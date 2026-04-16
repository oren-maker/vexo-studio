/**
 * Higgsfield Cloud API — text-to-video + image-to-video.
 *
 * Base: https://api.higgsfield.ai/v1/generations
 * Auth: Bearer token (HIGGSFIELD_API_KEY env var)
 * Flow: POST → 202 + generation ID → poll GET until done → download MP4
 *
 * Models available via Higgsfield: seedance-2, kling-3, veo-3, sora-2, wan-2.5
 * Cinema Studio presets add optical physics (lens, focal length, camera body).
 */

const BASE = "https://api.higgsfield.ai/v1";

export type HiggsModel =
  | "seedance-2.0"
  | "kling-3.0"
  | "wan-2.5"
  | "higgsfield-default";

export type HiggsTask = "text-to-video" | "image-to-video";

function key(): string {
  const k = process.env.HIGGSFIELD_API_KEY;
  if (!k) throw new Error("HIGGSFIELD_API_KEY not set");
  return k;
}

export async function submitHiggsVideo(opts: {
  prompt: string;
  task?: HiggsTask;
  model?: HiggsModel;
  durationSeconds?: number;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  imageUrl?: string;
  motionIntensity?: "low" | "medium" | "high";
}): Promise<{ id: string; status: string }> {
  const body: Record<string, unknown> = {
    task: opts.imageUrl ? "image-to-video" : (opts.task ?? "text-to-video"),
    model: opts.model ?? "higgsfield-default",
    prompt: opts.prompt.slice(0, 2000),
    duration: opts.durationSeconds ?? 20,
    fps: 30,
    motion_intensity: opts.motionIntensity ?? "medium",
  };
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.imageUrl) body.input_image = opts.imageUrl;

  const res = await fetch(`${BASE}/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
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
    id: data.id ?? data.generation_id ?? data.job_id ?? "",
    status: data.status ?? "queued",
  };
}

export async function pollHiggsVideo(generationId: string): Promise<{
  status: "queued" | "processing" | "completed" | "failed";
  progress?: number;
  videoUrl?: string;
  error?: string;
}> {
  const res = await fetch(`${BASE}/generations/${generationId}`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) {
    throw new Error(`Higgsfield poll ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = await res.json();
  return {
    status: data.status ?? "processing",
    progress: data.progress ?? undefined,
    videoUrl: data.output?.video_url ?? data.video_url ?? data.result?.url ?? undefined,
    error: data.error ?? undefined,
  };
}

export async function downloadHiggsVideo(generationId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${BASE}/generations/${generationId}/download`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) {
    throw new Error(`Higgsfield download ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

export const HIGGS_PRICING: Record<string, number> = {
  "seedance-2.0": 0.05,
  "kling-3.0": 0.06,
  "wan-2.5": 0.04,
  "higgsfield-default": 0.05,
};

export function priceHiggs(model: string, seconds: number): number {
  const rate = HIGGS_PRICING[model] ?? 0.05;
  return +(rate * seconds).toFixed(4);
}
