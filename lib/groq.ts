// Unified AI client. Uses Gemini as primary (generous free tier),
// falls back to Groq Llama 3.3 70B on errors / rate limits.
// Kept named "groq" for backwards-compat with existing service imports.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
// gemini-flash-latest is the working alias. 2.5-flash returns 503 'high demand'
// globally and 1.5/2.0 are 404 in v1beta. Latest alias auto-routes to whatever's stable.
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash"];
const GEMINI_URL = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

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

// Google Gemini 2.5 Flash pricing (paid Google Cloud billing) — same passthrough as fal.
const GEMINI_DIRECT_PRICING = { perMillionInput: 0.075, perMillionOutput: 0.30 };

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
      ...(opts.responseFormat === "json"
        ? { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }
        : {}),
    },
  };
  let res!: Response;
  let lastErr: string | null = null;
  let usedModel = "";
  for (const model of GEMINI_MODELS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 18_000);
    try {
      res = await fetch(`${GEMINI_URL(model)}?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctl.signal,
      });
      clearTimeout(timer);
      if (res.ok) { usedModel = model; break; }
      lastErr = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
      if (res.status !== 503 && res.status !== 429) break; // not a capacity issue → don't waste time on other models
    } catch (e) {
      clearTimeout(timer);
      lastErr = `${model} ${(e as Error).message.slice(0, 100)}`;
    }
  }
  if (!usedModel) throw new Error(`Gemini chain exhausted: ${lastErr}`);
  try {
    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Track cost INLINE (serverless freezes background promises after response,
    // so fire-and-forget = lost data). Hard 4s timeout so billing latency can't
    // break the AI call. Even on timeout we still return the text.
    try {
      const usage = data.usageMetadata ?? {};
      const inputTokens = usage.promptTokenCount ?? Math.ceil((system.length + userTurns.reduce((a, t) => a + t.parts[0].text.length, 0)) / 4);
      const outputTokens = usage.candidatesTokenCount ?? Math.ceil(text.length / 4);
      const costUsd = +(((inputTokens / 1_000_000) * GEMINI_DIRECT_PRICING.perMillionInput) + ((outputTokens / 1_000_000) * GEMINI_DIRECT_PRICING.perMillionOutput)).toFixed(6);
      if (costUsd > 0) {
        const { chargeUsd } = await import("./billing");
        const { getRequestActor } = await import("./request-context");
        const actor = getRequestActor();
        const orgId = opts.organizationId ?? actor?.organizationId;
        if (orgId) {
          const charge = chargeUsd({
            organizationId: orgId,
            projectId: opts.projectId ?? actor?.projectId ?? null,
            entityType: "AI_TEXT",
            entityId: opts.projectId ?? actor?.projectId ?? "global",
            providerName: "Google Gemini",
            category: "TOKEN",
            description: opts.description ?? `Gemini direct · in:${inputTokens} out:${outputTokens}`,
            unitCost: costUsd,
            quantity: 1,
            userId: actor?.userId,
            meta: { inputTokens, outputTokens, model: usedModel, source: "google-direct" },
          });
          await Promise.race([
            charge,
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
        }
      }
    } catch (e) { console.warn("[gemini-cost-track]", (e as Error).message); }

    return text;
  } catch (e) { throw e; }
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

  // Persist cost INLINE with 4s timeout (serverless drops background promises).
  if (r.costUsd > 0) {
    try {
      const { chargeUsd } = await import("./billing");
      const { getRequestActor } = await import("./request-context");
      const actor = getRequestActor();
      const orgId = opts.organizationId ?? actor?.organizationId;
      if (orgId) {
        const charge = chargeUsd({
          organizationId: orgId,
          projectId: opts.projectId ?? actor?.projectId ?? null,
          entityType: "AI_TEXT",
          entityId: opts.projectId ?? actor?.projectId ?? "global",
          providerName: "fal.ai",
          category: "TOKEN",
          description: opts.description ?? `Gemini text · in:${r.inputTokens} out:${r.outputTokens}`,
          unitCost: r.costUsd,
          quantity: 1,
          userId: actor?.userId,
          meta: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, model: "gemini-2.5-flash", source: "fal-any-llm" },
        });
        await Promise.race([charge, new Promise((resolve) => setTimeout(resolve, 2000))]);
      }
    } catch (e) { console.warn("[fal-gemini-cost-track]", (e as Error).message); }
  }

  return r.text;
}

export async function groqChat(messages: ChatMessage[], opts: AiOptions = {}): Promise<string> {
  // Google Gemini is now standalone (paid via Google Cloud Billing) — primary path.
  // Groq Llama is a free emergency fallback if Google is rate-limited or unreachable.
  // (callGeminiViaFal kept reachable but no longer in the default chain.)
  let lastErr: unknown;
  for (const fn of [callGemini, callGroq]) {
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
  try { return JSON.parse(cleaned) as T; } catch { /* try recovery */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]) as T; } catch { /* try truncated recovery */ }
  }
  // Truncated JSON: extract whatever key:"..." pairs we can parse, even if the
  // closing brace is missing. Each key like "style":"..." → into a partial obj.
  const partial: Record<string, string> = {};
  const re = /"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(cleaned))) {
    partial[mm[1]] = mm[2].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  if (Object.keys(partial).length > 0) return partial as T;
  throw new Error(`AI returned non-JSON: ${raw.slice(0, 200)}`);
}

export const GROQ_MODELS = {
  FAST: "llama-3.1-8b-instant",
  DEFAULT: "llama-3.3-70b-versatile",
  LONG_CONTEXT: "llama-3.3-70b-versatile",
} as const;
