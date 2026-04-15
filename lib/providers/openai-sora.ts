/**
 * OpenAI Sora 2 direct — text-to-video with synced audio.
 *
 * Endpoints (verified 2026-04-15):
 *   POST /v1/videos               — submit (returns { id, status:"queued" })
 *   GET  /v1/videos/{id}          — poll status (queued | in_progress | completed | failed)
 *   GET  /v1/videos/{id}/content  — download the MP4 bytes (auth-gated)
 *
 * Params:
 *   model   = "sora-2" | "sora-2-pro"
 *   seconds = "4" | "8" | "12"   (strings — enum, not free-form)
 *   size    = "1280x720" | "720x1280" | "1792x1024" | "1024x1792"
 *   prompt  = required
 *   (image input and reference images — NOT documented / not supported here)
 *
 * Pricing: sora-2 $0.10/sec · sora-2-pro $0.30/sec.
 */

const OPENAI = "https://api.openai.com/v1";

export type SoraModel = "sora-2" | "sora-2-pro";
export type SoraSize = "1280x720" | "720x1280" | "1792x1024" | "1024x1792";
export type SoraSeconds = "4" | "8" | "12";

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY not set");
  return k;
}

export async function submitSoraVideo(opts: {
  prompt: string;
  model: SoraModel;
  seconds: SoraSeconds;
  size?: SoraSize;
}): Promise<{ id: string; status: string }> {
  const body = {
    model: opts.model,
    prompt: opts.prompt.slice(0, 2000),
    seconds: opts.seconds,
    size: opts.size ?? "1280x720",
  };
  const res = await fetch(`${OPENAI}/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sora submit ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return { id: data.id, status: data.status };
}

export interface SoraPollResult {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  progress?: number;
  error?: { message: string } | null;
}

export async function pollSoraVideo(id: string): Promise<SoraPollResult> {
  const res = await fetch(`${OPENAI}/videos/${id}`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) throw new Error(`Sora poll ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return {
    id: data.id,
    status: data.status,
    progress: data.progress,
    error: data.error,
  };
}

/** Download the finished MP4 as a Buffer. Requires completed status. */
export async function downloadSoraVideo(id: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(`${OPENAI}/videos/${id}/content`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) throw new Error(`Sora download ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "video/mp4";
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytes: buf, mimeType };
}

export const SORA_PRICING: Record<SoraModel, number> = {
  "sora-2": 0.10,
  "sora-2-pro": 0.30,
};

export function priceSora(model: SoraModel, seconds: number): number {
  return +(SORA_PRICING[model] * seconds).toFixed(4);
}

/**
 * Pull the account's OpenAI credit balance. Uses the billing credit-grants
 * endpoint; returns { total, remaining }. Falls back to { total: 0, remaining: 0 }
 * on any error (billing APIs on OpenAI are flaky + versioned).
 */
export async function fetchOpenAiBalance(): Promise<{ total: number; remaining: number; source: string }> {
  const endpoints = [
    "https://api.openai.com/v1/dashboard/billing/credit_grants",
    "https://api.openai.com/dashboard/billing/credit_grants",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key()}` } });
      if (!res.ok) continue;
      const data = await res.json();
      const total = Number(data.total_granted ?? data.total_paid_available ?? 0);
      const remaining = Number(data.total_available ?? data.total_paid_available ?? 0);
      return { total, remaining, source: url };
    } catch { /* try next */ }
  }
  throw new Error("OpenAI balance endpoints all failed (the /v1/dashboard/billing API is deprecated; set manually or track locally)");
}
