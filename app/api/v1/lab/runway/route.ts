import { NextRequest, NextResponse } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { rateLimit } from "@/lib/learn/rate-limit";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Runway Gen-4 Turbo pricing (USD per second, approximate)
const RUNWAY_USD_PER_SEC = 0.05;

const BASE = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";

function authHeaders(): Record<string, string> | null {
  const key = (process.env.RUNWAYML_API_KEY || process.env.RUNWAY_API_KEY || "").trim();
  if (!key) return null;
  return {
    Authorization: `Bearer ${key}`,
    "X-Runway-Version": VERSION,
    "Content-Type": "application/json",
  };
}

// POST — submit image_to_video
// Body: { promptText, promptImage (URL), model?, ratio?, duration?, seed? }
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const rl = rateLimit(`lab-runway:${ctx.user.id}`, 10, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: `rate limit: retry in ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 });
    const headers = authHeaders();
    if (!headers) return NextResponse.json({ error: "RUNWAYML_API_KEY missing" }, { status: 500 });
    const { promptText, promptImage, model = "gen4_turbo", ratio = "1280:720", duration = 10 } = await req.json();
    if (!promptText) return NextResponse.json({ error: "promptText required" }, { status: 400 });
    if (!promptImage) return NextResponse.json({ error: "promptImage (URL) required" }, { status: 400 });

    const body = {
      promptText: String(promptText).slice(0, 1000),
      promptImage: String(promptImage),
      model,
      ratio,
      duration,
      seed: Math.floor(Math.random() * 1_000_000_000),
    };

    const res = await fetch(`${BASE}/image_to_video`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `Runway ${res.status}: ${text.slice(0, 120)}` }, { status: 500 });
    }
    const data = JSON.parse(text);
    await logUsage({
      model: `runway-${model}`,
      operation: "video-gen",
      videoSeconds: Number(duration) || 0,
      meta: { lab: true, taskId: data.id, usdCostOverride: (Number(duration) || 0) * RUNWAY_USD_PER_SEC, userId: ctx.user.id },
    });
    return NextResponse.json({ ok: true, taskId: data.id, model, duration });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}

// GET — poll task status
// ?id=<taskId>
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (isAuthResponse(auth)) return auth;
    const headers = authHeaders();
    if (!headers) return NextResponse.json({ error: "RUNWAYML_API_KEY missing" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const res = await fetch(`${BASE}/tasks/${id}`, { headers });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ error: `poll ${res.status}: ${text.slice(0, 120)}` }, { status: 500 });
    const data = JSON.parse(text);
    // Runway returns: status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | ...
    // output: array of video URLs on SUCCEEDED
    const videoUrl = Array.isArray(data.output) ? data.output[0] : null;
    return NextResponse.json({
      status: data.status,
      progress: data.progress ?? null,
      videoUrl,
      error: data.failure ?? data.error ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
