// Gemini text embeddings via gemini-embedding-001 (formerly text-embedding-004).

import { logUsage } from "./usage-tracker";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-embedding-001";

export async function embedText(text: string): Promise<number[]> {
  if (!API_KEY) throw new Error("GEMINI_API_KEY missing");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${API_KEY}`;
  const body = {
    model: `models/${MODEL}`,
    content: { parts: [{ text: text.slice(0, 8000) }] },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`embed ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const values: number[] = json?.embedding?.values || [];
  if (values.length === 0) throw new Error("embed: empty vector");
  await logUsage({
    model: MODEL,
    operation: "knowledge-extract",
    inputTokens: Math.round(text.length / 4),
    outputTokens: 0,
    meta: { embedding: true, dim: values.length },
  });
  return values;
}

export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
