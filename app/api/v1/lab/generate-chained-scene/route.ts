import { NextRequest, NextResponse } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { rateLimit } from "@/lib/learn/rate-limit";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SEEDANCE_USD_PER_SEC = 0.047;

const BASE = "https://platform.higgsfield.ai";
const MODEL = "bytedance/seedance/v1.5/pro/text-to-video";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

function authHeader(): string | null {
  const id = (process.env.HIGGSFIELD_API_ID ?? "").trim();
  const secret = (process.env.HIGGSFIELD_API_KEY ?? "").trim();
  if (!id || !secret) return null;
  return `Key ${id}:${secret}`;
}

async function submitSeedance(prompt: string): Promise<{ requestId: string; error?: string }> {
  const auth = authHeader();
  if (!auth) return { requestId: "", error: "HIGGSFIELD creds missing" };
  const res = await fetch(`${BASE}/${MODEL}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: prompt.slice(0, 2000),
      aspect_ratio: "16:9",
      duration: 10,
      seed: Math.floor(Math.random() * 1_000_000),
    }),
  });
  if (!res.ok) return { requestId: "", error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
  const data = await res.json();
  return { requestId: data.request_id ?? data.id ?? "" };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const rl = rateLimit(`lab-chain:${ctx.user.id}`, 5, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: `rate limit: retry in ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 });
    if (!GEMINI_API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY missing" }, { status: 500 });
    const { sceneData } = await req.json().catch(() => ({ sceneData: null }));
    if (!sceneData) return NextResponse.json({ error: "sceneData required" }, { status: 400 });

    const system = `You are a film director building TWO connected Seedance text-to-video prompts for ONE 20-second scene. Part A = seconds 0-10. Part B = seconds 10-20 and MUST continue from exactly where Part A ended (same lighting, same wardrobe, same framing vocabulary, same audio continuity).

Output JSON ONLY (no markdown fences):
{
  "partA": "<full 500-700 word Seedance prompt for seconds 0-10, with 8 sections: CHARACTER DESIGN (strict), VISUAL STYLE, LENS, COLOR, LIGHTING, AUDIO, TIMELINE [0-2s/2-4s/4-6s/6-8s/8-10s], QUALITY>",
  "partB": "<full 500-700 word Seedance prompt for seconds 10-20, starts EXACTLY where Part A cut (same character position/expression/room), TIMELINE [0-2s/2-4s/4-6s/6-8s/8-10s]>",
  "bridgeNote": "<1 sentence — what must match visually between end of A and start of B>"
}

Character identity MUST stay identical between parts. Hard rules like "NO GLASSES on Maya" appear in BOTH prompts. No markdown fencing.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: "Scene data:\n" + JSON.stringify(sceneData, null, 2) + "\n\nReturn JSON now." }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: "application/json" },
      }),
    });
    const j: any = await res.json();
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());

    const [a, b] = await Promise.all([submitSeedance(parsed.partA), submitSeedance(parsed.partB)]);

    // Log each successfully submitted part at 10s each
    for (const [label, part] of [["A", a], ["B", b]] as const) {
      if (!part.error) {
        await logUsage({
          model: MODEL,
          operation: "video-gen",
          videoSeconds: 10,
          meta: { lab: true, chained: label, requestId: part.requestId, usdCostOverride: 10 * SEEDANCE_USD_PER_SEC, userId: ctx.user.id },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      bridgeNote: parsed.bridgeNote,
      partA: { requestId: a.requestId, error: a.error, prompt: parsed.partA },
      partB: { requestId: b.requestId, error: b.error, prompt: parsed.partB },
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
