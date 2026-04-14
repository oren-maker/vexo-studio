const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface GroqOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
}

export function hasGroq(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function groqChat(messages: ChatMessage[], opts: GroqOptions = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
  };
  if (opts.responseFormat === "json") body.response_format = { type: "json_object" };

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Groq ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function groqJson<T = unknown>(system: string, user: string, opts: GroqOptions = {}): Promise<T> {
  const raw = await groqChat(
    [
      { role: "system", content: `${system}\n\nYou MUST respond with valid JSON only. No markdown, no code fences, no commentary.` },
      { role: "user", content: user },
    ],
    { ...opts, responseFormat: "json" },
  );
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Try to extract JSON from a code block or mid-text
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error(`Groq returned non-JSON: ${raw.slice(0, 200)}`);
  }
}

export const GROQ_MODELS = {
  FAST: "llama-3.1-8b-instant",
  DEFAULT: "llama-3.3-70b-versatile",
  LONG_CONTEXT: "llama-3.3-70b-versatile",
} as const;
