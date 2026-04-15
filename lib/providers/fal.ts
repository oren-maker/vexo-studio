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
export type VideoModel = "seedance" | "kling" | "veo3-pro" | "veo3-fast" | "vidu-q1";

const IMAGE_MODELS: Record<ImageModel, string> = {
  "nano-banana": "fal-ai/nano-banana",
};

const VIDEO_MODELS: Record<VideoModel, string> = {
  seedance:    "fal-ai/bytedance/seedance/v1/pro/text-to-video",
  kling:       "fal-ai/kling-video/v2.1/master/text-to-video",
  "veo3-pro":  "fal-ai/veo3",
  "veo3-fast": "fal-ai/veo3/fast",
  "vidu-q1":   "fal-ai/vidu/q1/reference-to-video",
};

// Image-to-video variants. Used when we have a reference image (storyboard
// frame or character) and want the video to start from it — keeps identity
// locked to the frame instead of rolling the dice on a fresh text-only render.
// Vidu Q1 doesn't have a separate i2v — it already takes multiple references.
const VIDEO_MODELS_I2V: Partial<Record<VideoModel, string>> = {
  seedance:    "fal-ai/bytedance/seedance/v1/pro/image-to-video",
  kling:       "fal-ai/kling-video/v2.1/master/image-to-video",
  "veo3-pro":  "fal-ai/veo3/image-to-video",
  "veo3-fast": "fal-ai/veo3/fast/image-to-video",
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

// Strong photorealism. nano-banana defaults to stylized/digital-art output,
// especially when the incoming prompt contains "cinematic" or "dramatic lighting"
// or anything sci-fi-leaning. We prefix with documentary/journalism framing
// (impossible to interpret as an illustration) and reinforce heavily at the end.
// 6-layer prompt formula (Claude School guide, 2026-04-14):
// Subject → Action → Environment → Art Style → Lighting → Technical.
// The user's prompt supplies layers 1-3 (who/what, doing what, where).
// The PREFIX front-loads "this is a REAL PHOTOGRAPH" framing (earliest tokens
// carry the most weight), the SUFFIX lays down layers 4-6 in order plus the
// anti-plastic phrases that kill the "AI look" (visible pores, fabric weave,
// Rembrandt lighting) and negations for what we never want.
const REALISM_PREFIX = "REAL PHOTOGRAPH taken by a professional photographer on a Sony A7 IV camera, NOT a digital painting, NOT a 3D render, NOT AI art. Photojournalism documentary style, candid unposed moment. Subject: ";
const REALISM_SUFFIX = " [Art Style] photorealistic editorial photography in the style of a National Geographic or Kinfolk magazine feature, hyper-realistic, cinematic shot. [Lighting] natural daylight with soft shadows, Rembrandt lighting on faces, golden-hour warmth where the scene allows, light reflecting naturally off skin and fabric. [Technical] shot on 35mm full-frame lens at f/1.8, 8k resolution, sharp focus on eyes, shallow depth of field with creamy bokeh, subtle 35mm film grain. [Anti-plastic] real human skin with visible pores, faint freckles and natural blemishes, real eyes with caught catch-light and iris detail, individual hair strands, realistic fabric with visible weave and natural folds, accurate physical shadows, no skin smoothing. This is a REAL PHOTOGRAPH of REAL PEOPLE. STRICTLY NOT animated, NOT cartoon, NOT anime, NOT 3D render, NOT illustration, NOT painted, NOT digital art, NOT stylized, NOT holographic, NOT neon-lit sci-fi, NOT plastic skin, NOT doll-like faces.";

// Strip style words that routinely push nano-banana into digital-art territory.
function sanitizeForRealism(prompt: string): string {
  return prompt
    // remove dramatic lighting jargon that the model renders as glowing neon
    .replace(/\b(holographic|hologram|neon[- ]lit|digital[- ]art|rendered|cinematic lighting|dramatic lighting|glowing edges?|sci[- ]?fi|cyberpunk|vaporwave|dreamlike|surreal)\b/gi, "")
    // cleanup double spaces
    .replace(/\s{2,}/g, " ").trim();
}

export async function generateImage(opts: { prompt: string; negativePrompt?: string; aspectRatio?: "1:1" | "16:9" | "9:16"; model?: ImageModel; referenceImageUrls?: string[] }): Promise<ImageResult> {
  const model = IMAGE_MODELS[opts.model ?? "nano-banana"];
  const body: Record<string, unknown> = {
    prompt: REALISM_PREFIX + sanitizeForRealism(opts.prompt) + REALISM_SUFFIX,
    num_images: 1,
    output_format: "jpeg",
  };
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  // nano-banana (Gemini 2.5 Flash Image) supports image_urls for identity reference.
  // Passing up to 3 reference images keeps characters consistent across frames.
  if (opts.referenceImageUrls && opts.referenceImageUrls.length > 0) {
    body.image_urls = opts.referenceImageUrls.slice(0, 3);
  }

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
  /** Optional starting frame URL. If set, we route to the image-to-video variant
   * of the chosen model so the video's first frame locks to this image. */
  imageUrl?: string;
  /** Extra reference images (e.g. character galleries). Passed as image_urls where supported. */
  referenceImageUrls?: string[];
}): Promise<VideoSubmitResult> {
  const modelKey = opts.model ?? "seedance";
  const isVidu = modelKey === "vidu-q1";
  // Vidu takes reference_image_urls (up to 7) — not image_url — so i2v routing
  // doesn't apply. Always route to the t2v endpoint.
  const useI2V = !isVidu && !!opts.imageUrl;
  const model = (useI2V ? VIDEO_MODELS_I2V[modelKey] : VIDEO_MODELS[modelKey]) ?? VIDEO_MODELS[modelKey];
  // Photorealism must be at the FRONT of the prompt for highest weight.
  // VEO 3 and SeeDance ignore negative_prompt; only Kling honors it.
  // VEO 3 quirks (from live testing Apr 2026):
  //   • duration ONLY accepts literal "4s"/"6s"/"8s" — numeric strings get 422
  //   • heavy "NOT X" negations and long anti-plastic suffixes trigger
  //     `no_media_generated` at fal. Keep VEO prompts short, positive, scene-only.
  //   • negative_prompt is silently dropped.
  // SeeDance/Kling are the opposite: integer seconds + tolerate the full realism
  // wrapper. Apply the wrapper only for those models.
  const rawSec = Math.max(1, Math.min(opts.durationSeconds ?? 5, 20));
  const isVeo = modelKey === "veo3-pro" || modelKey === "veo3-fast";
  const veoDuration = rawSec <= 5 ? "4s" : rawSec <= 7 ? "6s" : "8s";
  const identityLock = useI2V ? "Keep every person's face, hair, skin, wardrobe identical to the starting image. " : "";
  const finalPrompt = isVeo
    // VEO: keep it *tight*. Long prompts + style/music directives regularly
    // trigger `no_media_generated`. Cap at 800 chars for Pro/Fast and drop the
    // realism preamble entirely — i2v already anchors realism via the seed frame.
    ? (useI2V ? opts.prompt.slice(0, 800) : ("Live-action footage. " + opts.prompt).slice(0, 800))
    : isVidu
    // Vidu Q1 anchors identity from the reference_image_urls already — keep the
    // prompt tight and descriptive, no heavy realism wrappers.
    ? opts.prompt.slice(0, 1200)
    : ("Live-action photorealistic film footage, REAL human actors filmed on a cinema camera, NOT animation, NOT CGI. " + identityLock + "Subject: " + opts.prompt
        + " [Art Style] photorealistic prestige-drama cinematography, Netflix/A24 feature-film look. [Lighting] natural physical lighting with soft shadows, Rembrandt lighting on faces. [Technical] 8k, 24fps, 35mm cinema lens at f/2, shallow depth of field, subtle film grain. [Anti-plastic] real skin with visible pores, real eye catch-light, natural micro-expressions, realistic fabric weave. STRICTLY NOT animated, NOT cartoon, NOT anime, NOT 3D animation, NOT illustration, NOT a video game cutscene, NOT plastic skin.");
  const body: Record<string, unknown> = {
    prompt: finalPrompt,
    duration: isVeo ? veoDuration : String(rawSec),
    aspect_ratio: opts.aspectRatio ?? "16:9",
  };
  // Only Kling honors negative_prompt. VEO rejects it on some configs; SeeDance
  // silently drops; sending universally caused 422 on VEO.
  if (modelKey === "kling") {
    body.negative_prompt = "cartoon, anime, animation, 3D render, illustration, painting, drawing, stylized, video game graphics, cgi look, plastic skin, doll-like faces, oversaturated colors";
  }
  if (useI2V && opts.imageUrl) body.image_url = opts.imageUrl;
  // image_urls is only supported on the text-to-video path of specific models
  // (some fal endpoints 400 on unknown fields). Only send when NOT using i2v.
  if (!useI2V && opts.referenceImageUrls && opts.referenceImageUrls.length > 0) {
    body.image_urls = opts.referenceImageUrls.slice(0, 3);
  }

  const makeUrl = (m: string) => opts.webhookUrl
    ? `${FAL_QUEUE}/${m}?fal_webhook=${encodeURIComponent(opts.webhookUrl)}`
    : `${FAL_QUEUE}/${m}`;

  let res = await fetch(makeUrl(model), { method: "POST", headers: headers(), body: JSON.stringify(body) });

  // If the i2v endpoint doesn't exist (404) OR rejected the image_url, retry on the t2v variant
  if (!res.ok && useI2V) {
    const status = res.status;
    const errText = (await res.text()).slice(0, 200);
    console.warn(`[fal video] i2v ${model} ${status}: ${errText} — retrying via t2v`);
    const t2vBody = { ...body };
    delete t2vBody.image_url;
    res = await fetch(makeUrl(VIDEO_MODELS[modelKey]), { method: "POST", headers: headers(), body: JSON.stringify(t2vBody) });
  }

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
  // Google VEO 3 via fal
  "veo3-pro":  { perSecond: 0.75 },
  "veo3-fast": { perSecond: 0.40 },

  // Text — Gemini 2.5 Flash via fal-ai/any-llm. Per 1M tokens (passthrough).
  "gemini-2.5-flash": { perMillionInput: 0.075, perMillionOutput: 0.30 },
  "gemini-2.5-pro":   { perMillionInput: 1.25,  perMillionOutput: 10.00 },
} as const;

// ---------------------------------------------------------------------------
// TEXT — Gemini via fal-ai/any-llm. Used as the primary text path so calls
// flow through the fal balance and show up in the wallet.
// ---------------------------------------------------------------------------
export interface GeminiChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const ANY_LLM_URL = `${FAL_RUN}/fal-ai/any-llm`;

export async function chatGeminiViaFal(opts: {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model?: "gemini-2.5-flash" | "gemini-2.5-pro";
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  timeoutMs?: number;
}): Promise<GeminiChatResult> {
  const model = opts.model ?? "gemini-2.5-flash";
  const falModel = model === "gemini-2.5-pro" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";

  // any-llm wants a prompt + optional system_prompt + history
  const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
  const userTurns = opts.messages.filter((m) => m.role !== "system");
  const lastUser = userTurns.at(-1)?.content ?? "";
  const history = userTurns.slice(0, -1).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  const body: Record<string, unknown> = {
    model: falModel,
    prompt: lastUser,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (system) body.system_prompt = system;
  if (history.length > 0) body.history = history;
  if (opts.responseFormat === "json") body.response_format = { type: "json_object" };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  let res: Response;
  try {
    res = await fetch(ANY_LLM_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } finally { clearTimeout(timer); }

  if (!res.ok) throw new Error(`fal Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text: string =
    data?.output ??
    data?.response ??
    data?.choices?.[0]?.message?.content ??
    data?.text ??
    "";

  // Token counts: prefer server-reported, fall back to char/4 heuristic
  const usage = data?.usage ?? data?.tokens ?? {};
  const inputTokens =
    usage.prompt_tokens ?? usage.input_tokens ??
    Math.ceil((lastUser.length + (system?.length ?? 0) + history.reduce((a, h) => a + h.content.length, 0)) / 4);
  const outputTokens =
    usage.completion_tokens ?? usage.output_tokens ??
    Math.ceil(text.length / 4);

  const pricing = FAL_PRICING_USD[model];
  const costUsd = +(((inputTokens / 1_000_000) * pricing.perMillionInput) + ((outputTokens / 1_000_000) * pricing.perMillionOutput)).toFixed(6);

  return { text, inputTokens, outputTokens, costUsd };
}

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
      // fal often returns just a primitive number for the balance endpoint.
      let b: number | undefined;
      let exp: number | undefined;
      let usage: number | undefined;
      if (typeof data === "number") {
        b = data;
      } else if (data && typeof data === "object") {
        b = data.user_balance ?? data.current_balance ?? data.balance ?? data.available ?? data.remaining ?? data.amount ?? data.usd;
        exp = data.expiring_soon ?? data.expiring ?? data.credits_expiring_in_365_days ?? data.expiring_credits;
        usage = data.usage_this_month ?? data.usage_month ?? data.month_usage ?? data.this_month_usage ?? data.month_to_date;
      }
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
