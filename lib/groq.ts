// Unified AI client. Uses Gemini as primary (generous free tier),
// falls back to Groq Llama 3.3 70B on errors / rate limits.
// Kept named "groq" for backwards-compat with existing service imports.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface AiOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
  // For cost attribution / audit
  projectId?: string;
  organizationId?: string;
  description?: string;
}

export function hasGroq(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(messages: ChatMessage[], opts: AiOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const userTurns = messages.filter((m) => m.role !== "system").map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: userTurns,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
    },
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } finally { clearTimeout(timer); }
}

async function callGroq(messages: ChatMessage[], opts: AiOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const body: Record<string, unknown> = {
    model: opts.model ?? GROQ_MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.responseFormat === "json") body.response_format = { type: "json_object" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } finally { clearTimeout(timer); }
  if (res.status === 429) {
    const retry = parseFloat(res.headers.get("retry-after") ?? "3");
    await sleep((retry + 0.5) * 1000);
    return callGroq(messages, opts);
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGeminiViaFal(messages: ChatMessage[], opts: AiOptions): Promise<string> {
  if (!process.env.FAL_API_KEY) throw new Error("no fal key");
  // Lazy-import to keep client bundle clean
  const { chatGeminiViaFal } = await import("./providers/fal");
  const r = await chatGeminiViaFal({
    messages,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    responseFormat: opts.responseFormat,
  });

  // Persist cost — fire-and-forget. Goes to the fal.ai provider so it shows up
  // in the wallet + financial report alongside image / video charges.
  if (r.costUsd > 0) {
    try {
      const { chargeUsd } = await import("./billing");
      const { getRequestActor } = await import("./request-context");
      const actor = getRequestActor();
      const orgId = opts.organizationId ?? actor?.organizationId;
      if (orgId) {
        await chargeUsd({
          organizationId: orgId,
          projectId: opts.projectId ?? null,
          entityType: "AI_TEXT",
          entityId: opts.projectId ?? "global",
          providerName: "fal.ai",
          category: "TOKEN",
          description: opts.description ?? `Gemini text · in:${r.inputTokens} out:${r.outputTokens}`,
          unitCost: r.costUsd,
          quantity: 1,
          userId: actor?.userId,
          meta: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: "gemini-2.5-flash" },
        });
      }
    } catch { /* never throw from billing path */ }
  }

  return r.text;
}

export async function groqChat(messages: ChatMessage[], opts: AiOptions = {}): Promise<string> {
  // PRIMARY: paid Gemini through fal.ai (cost tracked in wallet + financial report)
  // FALLBACK 1: Groq Llama 3.3 70B (free tier) if fal fails or no key
  // FALLBACK 2: Free Gemini direct (only if no fal key configured at all)
  let lastErr: unknown;
  for (const fn of [callGeminiViaFal, callGroq, callGemini]) {
    try {
      return await fn(messages, opts);
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("AI providers exhausted");
}

export async function groqJson<T = unknown>(system: string, user: string, opts: AiOptions = {}): Promise<T> {
  const raw = await groqChat(
    [
      { role: "system", content: `${system}\n\nYou MUST respond with valid JSON only. No markdown, no code fences, no commentary.` },
      { role: "user", content: user },
    ],
    { ...opts, responseFormat: "json" },
  );
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error(`AI returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

export const GROQ_MODELS = {
  FAST: "llama-3.1-8b-instant",
  DEFAULT: "llama-3.3-70b-versatile",
  LONG_CONTEXT: "llama-3.3-70b-versatile",
} as const;
