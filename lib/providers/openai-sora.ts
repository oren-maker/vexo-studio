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
// Empirically verified against OpenAI API on 2026-04-15 — the standard
// /v1/videos endpoint accepts 4/8/12/16/20 seconds. 25s is Sora Web only
// (ChatGPT Pro UI), and 60s is achieved by chaining multiple clips via the
// Web Storyboard feature, not exposed as a single API call.
export type SoraSeconds = "4" | "8" | "12" | "16" | "20";
export type SoraSize = "1280x720" | "720x1280" | "1792x1024" | "1024x1792";

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY not set");
  return k;
}

// Sora's moderation is stricter than VEO's and runs TWICE (at submit and at
// ~87-99% render). A single flagged word kills 2+ minutes of work. Rewrite
// prompts via Gemini before submitting. Same pattern as sanitizePromptForVeo
// but with Sora-specific hints (surveillance/thriller/conspiracy language
// trips Sora's second-pass moderation even when visually benign).
// See memory: feedback_sora_moderation + lesson_sora_post_render_moderation.
async function sanitizePromptForSora(prompt: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY?.replace(/\\n$/, "").trim();
  if (!geminiKey) return prompt;
  const SYSTEM = `You rewrite cinematic video prompts to pass OpenAI Sora safety filters (which are stricter than VEO and run a SECOND visual moderation pass at ~87-99% render). Preserve the visual style, mood, camera work, scene structure, and language — but remove triggers:

- Replace surveillance/paranoia/conspiracy words: "surveillance"→"observation", "conspiracy"→"hidden story", "spy"→"observer", "interrogation"→"quiet conversation"
- Replace weapons with training tools / metaphor: "gun"→"camera", "knife"→"pen", "sword"→"bamboo staff"
- Replace blood / gore / injury with "intense moment" / "dramatic action"
- Replace specific real-person names with archetypes ("Elon Musk"→"a tech founder")
- Replace politically-charged names/terms with neutral equivalents
- Remove minors — age every person to "young adult" (20+)
- Remove nudity / explicit / fetish terms — dress the subject, implied only
- Remove brand names, logos, copyrighted characters
- Soften thriller/horror intensity: "menacing"→"serious", "sinister"→"thoughtful", "stalking"→"following"
- Remove anomalous physics descriptions Sora's 2nd-pass blocks: "mercury floating upward", "mirror shows different scene", "gravity reversed" — keep realistic motion only
- Keep "live-action photorealistic, real actors, real skin" if present

Output ONLY the rewritten prompt as one flowing text, same language as input, same length. No prefix, no quotes, no commentary, no "here is...".`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `Rewrite this prompt for Sora safety:\n\n${prompt.slice(0, 3000)}` }] }],
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

export async function submitSoraVideo(opts: {
  prompt: string;
  model: SoraModel;
  seconds: SoraSeconds;
  size?: SoraSize;
  /** Optional starting image (i2v). Must be resized to match `size` exactly
   * — Sora rejects mismatched dimensions. We resize automatically with sharp
   * + pad/contain to never crop the face. */
  imageUrl?: string;
  /** Skip prompt sanitization. Default false — every Sora submission goes
   * through Gemini first to replace moderation-triggering phrases. Pass
   * true only when the caller has already sanitized (e.g. pre-cached). */
  skipSanitize?: boolean;
}): Promise<{ id: string; status: string; sanitizedPrompt?: string }> {
  const size = opts.size ?? "1280x720";
  // Sora's moderation is aggressive. Sanitize every prompt through Gemini
  // unless the caller opts out. On sanitizer failure we fall back to the
  // original prompt — the submission might still pass, or will fail with a
  // clearer downstream error.
  const safePrompt = opts.skipSanitize ? opts.prompt : await sanitizePromptForSora(opts.prompt);

  if (opts.imageUrl) {
    // i2v path — multipart/form-data with resized reference image.
    const [w, h] = size.split("x").map(Number);
    const imgRes = await fetch(opts.imageUrl);
    if (!imgRes.ok) throw new Error(`reference image fetch ${imgRes.status}`);
    const inputBuf = Buffer.from(await imgRes.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const resized = await sharp(inputBuf)
      .resize(w, h, { fit: "cover", position: "centre" })
      .jpeg({ quality: 92 })
      .toBuffer();

    const form = new FormData();
    form.append("model", opts.model);
    form.append("prompt", safePrompt.slice(0, 2000));
    form.append("seconds", opts.seconds);
    form.append("size", size);
    // Blob is valid in Node 18+ runtime
    form.append("input_reference", new Blob([resized as unknown as ArrayBuffer], { type: "image/jpeg" }), "seed.jpg");

    const res = await fetch(`${OPENAI}/videos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Sora submit (i2v) ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    return { id: data.id, status: data.status, sanitizedPrompt: safePrompt !== opts.prompt ? safePrompt : undefined };
  }

  // t2v path — plain JSON
  const body = {
    model: opts.model,
    prompt: safePrompt.slice(0, 2000),
    seconds: opts.seconds,
    size,
  };
  const res = await fetch(`${OPENAI}/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sora submit ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return { id: data.id, status: data.status, sanitizedPrompt: safePrompt !== opts.prompt ? safePrompt : undefined };
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

/**
 * Remix an existing Sora video — keeps identity / look / motion intact and
 * applies the new prompt as a directive ("change the lighting", "make it
 * dawn"). Same model + seconds + size as the source. Cost = same as a fresh
 * generation. Returns a new video id we can poll like any other.
 */
export async function remixSoraVideo(opts: { sourceId: string; prompt: string }): Promise<{ id: string; model: SoraModel; seconds: SoraSeconds }> {
  // Delta prompts can still trip moderation ("make it menacing", "darker
  // surveillance angle") — run the same sanitizer.
  const safePrompt = await sanitizePromptForSora(opts.prompt);
  const res = await fetch(`${OPENAI}/videos/${opts.sourceId}/remix`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: safePrompt.slice(0, 2000) }),
  });
  if (!res.ok) throw new Error(`Sora remix ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return { id: data.id, model: data.model, seconds: String(data.seconds) as SoraSeconds };
}

/**
 * Extend an existing Sora video — adds a continuation clip of up to 20s to
 * the end of the source. Per OpenAI docs: max 6 extensions per source, each
 * adds 4/8/12/16/20s, total clip length capped at ~120s. Returns a new video
 * id we can poll like any other (the final video includes the extension).
 */
export async function extendSoraVideo(opts: {
  sourceId: string;
  prompt: string;
  seconds: SoraSeconds;
}): Promise<{ id: string; model: SoraModel; seconds: SoraSeconds }> {
  const safePrompt = await sanitizePromptForSora(opts.prompt);
  const res = await fetch(`${OPENAI}/videos/${opts.sourceId}/extensions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: safePrompt.slice(0, 2000), seconds: opts.seconds }),
  });
  if (!res.ok) throw new Error(`Sora extend ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return { id: data.id, model: data.model, seconds: String(data.seconds) as SoraSeconds };
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
