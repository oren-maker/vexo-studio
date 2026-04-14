import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

const Body = z.object({
  texts: z.array(z.string().min(1).max(2000)).min(1).max(40),
  target: z.enum(["he", "en"]),
});

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function translateGroq(texts: string[]): Promise<string[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const sys = "You are a Hebrew UI translator. For EACH numbered English line below, output a Hebrew translation on its own line, prefixed by the SAME number and a dot. Translate everything that can be translated, including ALL_CAPS labels (MEMBERS=חברים, ACTIVE=פעיל, STUDIO=סטודיו, etc.), short words (View=צפייה, all=הכל), and product/show names (Echoes of Tomorrow=הדים של מחר). Keep numbers, currency symbols, %, emojis, URLs, emails, code identifiers (snake_case, kebab-case), and one-letter codes unchanged. Never skip a line. Reply ONLY with the numbered Hebrew lines, nothing else.";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: numbered }],
        temperature: 0.1,
        max_tokens: Math.min(2500, texts.length * 100),
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const txt: string = data.choices?.[0]?.message?.content ?? "";
    // Parse numbered list
    const lines = txt.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out: string[] = new Array(texts.length);
    for (const line of lines) {
      const m = line.match(/^(\d+)[.)\]:\s-]+(.+)$/);
      if (!m) continue;
      const idx = Number(m[1]) - 1;
      if (idx < 0 || idx >= texts.length) continue;
      out[idx] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out.map((v, i) => v || texts[i]);
  } finally { clearTimeout(timer); }
}

async function translateGemini(texts: string[]): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const sys = "Translate each numbered English UI string to natural Hebrew. Keep numbers, %, $, emojis, brand names, URLs, code identifiers, proper nouns unchanged. Output ONLY the translated lines in the same `N. translation` format, no commentary.";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: numbered }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: Math.min(2000, texts.length * 80) },
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const txt: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const lines = txt.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const out: string[] = new Array(texts.length);
    for (const line of lines) {
      const m = line.match(/^(\d+)[.)\]:\s-]+(.+)$/);
      if (!m) continue;
      const idx = Number(m[1]) - 1;
      if (idx < 0 || idx >= texts.length) continue;
      out[idx] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out.map((v, i) => v || texts[i]);
  } finally { clearTimeout(timer); }
}

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    if (body.target === "en") return ok({ translations: body.texts });
    let lastErr: unknown;
    // Order: Gemini (high quality, fast) → Groq fallback. Retry once on rate limit.
    for (const fn of [translateGemini, translateGroq, translateGemini, translateGroq]) {
      try {
        const out = await fn(body.texts);
        return ok({ translations: out });
      } catch (e) {
        lastErr = e;
        if (String(e).includes("429")) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return NextResponse.json({ statusCode: 502, error: "BadGateway", message: String(lastErr).slice(0, 300) }, { status: 502 });
  } catch (e) { return handleError(e); }
}
