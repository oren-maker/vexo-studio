/**
 * UI translation: Gemini-primary, persisted in DB so each unique string is
 * translated at most once across all users / sessions / deploys.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 30;

const Body = z.object({
  texts: z.array(z.string().min(1).max(2000)).min(1).max(40),
  target: z.enum(["he", "en"]),
});

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

function hash(s: string, lang: string): string {
  return crypto.createHash("sha256").update(`${lang}::${s}`).digest("hex").slice(0, 32);
}

function parseNumberedLines(txt: string, n: number, originals: string[]): string[] {
  const lines = txt.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = new Array(n);
  for (const line of lines) {
    const m = line.match(/^(\d+)[.)\]:\s-]+(.+)$/);
    if (!m) continue;
    const idx = Number(m[1]) - 1;
    if (idx < 0 || idx >= n) continue;
    out[idx] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out.map((v, i) => v || originals[i]);
}

async function translateGemini(texts: string[]): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("no gemini key");
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const sys = "Translate each numbered English UI string to natural Hebrew. Translate everything (including ALL_CAPS labels, single words, proper nouns, show names). Keep numbers, %, $, emojis, URLs, code identifiers (snake_case, kebab-case) unchanged. Reply ONLY with the numbered Hebrew lines, one per line, in `N. translation` format.";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 18_000);
  try {
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: numbered }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: Math.min(2500, texts.length * 100) },
      }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const txt: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseNumberedLines(txt, texts.length, texts);
  } finally { clearTimeout(timer); }
}

async function translateGroq(texts: string[]): Promise<string[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("no groq key");
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const sys = "Translate each numbered English UI string to natural Hebrew. Translate everything (incl ALL_CAPS labels, single words, proper nouns). Keep numbers, %, $, emojis, URLs, code identifiers unchanged. Reply ONLY with numbered Hebrew lines.";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
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
  } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const txt: string = data.choices?.[0]?.message?.content ?? "";
  return parseNumberedLines(txt, texts.length, texts);
}

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    if (body.target === "en") return ok({ translations: body.texts });

    // 1. Look up DB cache
    const hashes = body.texts.map((t) => hash(t, body.target));
    const cached = await prisma.translation.findMany({ where: { hash: { in: hashes }, targetLang: body.target } });
    const cacheMap = new Map(cached.map((c) => [c.hash, c.text]));

    const result: (string | undefined)[] = body.texts.map((_, i) => cacheMap.get(hashes[i]));
    const missingIdx: number[] = [];
    result.forEach((v, i) => { if (!v || !/[\u0590-\u05FF]/.test(v)) missingIdx.push(i); });

    // 2. Translate the missing ones (if any)
    if (missingIdx.length > 0) {
      const toTranslate = missingIdx.map((i) => body.texts[i]);
      let out: string[] = [];
      let lastErr: unknown;
      for (const fn of [translateGemini, translateGroq]) {
        try { out = await fn(toTranslate); break; }
        catch (e) { lastErr = e; }
      }
      if (out.length !== toTranslate.length) {
        // Soft-fail: return what we have (English fallback for missing)
        const final = body.texts.map((t, i) => result[i] ?? t);
        return NextResponse.json({ translations: final, partial: true, error: String(lastErr).slice(0, 200) }, { status: 200 });
      }
      const writes: Promise<unknown>[] = [];
      for (let k = 0; k < missingIdx.length; k++) {
        const i = missingIdx[k];
        const tr = out[k];
        result[i] = tr;
        if (tr && /[\u0590-\u05FF]/.test(tr)) {
          writes.push(prisma.translation.upsert({
            where: { hash_targetLang: { hash: hashes[i], targetLang: body.target } },
            update: { text: tr },
            create: { hash: hashes[i], source: body.texts[i].slice(0, 1000), targetLang: body.target, text: tr },
          }).catch(() => {}));
        }
      }
      await Promise.all(writes);
    }

    return ok({ translations: result.map((v, i) => v ?? body.texts[i]) });
  } catch (e) { return handleError(e); }
}
