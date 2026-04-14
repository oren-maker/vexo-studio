import { NextRequest } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const url = new URL(req.url);
    const model = url.searchParams.get("model") ?? "gemini-1.5-flash";
    const tokens = Number(url.searchParams.get("tokens") ?? "1500");

    const t0 = Date.now();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    let res!: Response;
    let body = "";
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are a director. Output JSON {style,scene,character,shots,camera,effects,audio,technical} all strings under 200 chars each." }] },
          contents: [{ role: "user", parts: [{ text: "Scene: Mira Chen looks in the mirror confused, then her phone rings, Maya tells her about the Wilson case." }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: tokens, temperature: 0.4 },
        }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      body = await res.text();
    } catch (e) {
      clearTimeout(timer);
      return ok({ error: (e as Error).message, elapsedMs: Date.now() - t0, model, tokens });
    }
    const elapsedMs = Date.now() - t0;
    return ok({ ok: res.ok, status: res.status, elapsedMs, model, tokens, sample: body.slice(0, 400), full_length: body.length });
  } catch (e) { return handleError(e); }
}
