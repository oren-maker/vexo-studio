import { NextRequest, NextResponse } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { rateLimit } from "@/lib/learn/rate-limit";
import { logUsage } from "@/lib/learn/usage-tracker";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Higgsfield Seedance pricing (USD per second)
const SEEDANCE_USD_PER_SEC = 0.047;

const BASE = "https://platform.higgsfield.ai";
const TEXT_MODEL = "bytedance/seedance/v1.5/pro/text-to-video";
const IMG_MODEL = "bytedance/seedance/v1/pro/image-to-video";

function authHeader(): string | null {
  const id = (process.env.HIGGSFIELD_API_ID ?? "").trim();
  const secret = (process.env.HIGGSFIELD_API_KEY ?? "").trim();
  if (!id || !secret) return null;
  return `Key ${id}:${secret}`;
}

// Lab-only: build + submit + return request_id. Client polls separately.
export async function POST(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const rl = rateLimit(`lab-generate:${ctx.user.id}`, 10, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: `rate limit: retry in ${Math.ceil(rl.resetMs / 1000)}s` }, { status: 429 });

    const auth = authHeader();
    if (!auth) return NextResponse.json({ error: "HIGGSFIELD credentials missing" }, { status: 500 });
    const { prompt, durationSeconds = 5, aspectRatio = "16:9", imageUrl } = await req.json();
    if (!prompt || typeof prompt !== "string") return NextResponse.json({ error: "prompt required" }, { status: 400 });

    // Image-to-video preserves character identity; text-to-video is the fallback.
    const MODEL = imageUrl ? IMG_MODEL : TEXT_MODEL;
    const body: Record<string, unknown> = {
      prompt: prompt.slice(0, 2000),
      aspect_ratio: aspectRatio,
      duration: durationSeconds,
      seed: Math.floor(Math.random() * 1_000_000),
    };
    if (imageUrl) body.image_url = imageUrl;

    const res = await fetch(`${BASE}/${MODEL}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Higgsfield ${res.status}: ${text.slice(0, 400)}` }, { status: 500 });
    }
    const data = await res.json();
    await logUsage({
      model: MODEL,
      operation: "video-gen",
      videoSeconds: Number(durationSeconds) || 0,
      meta: { lab: true, requestId: data.request_id ?? data.id, usdCostOverride: (Number(durationSeconds) || 0) * SEEDANCE_USD_PER_SEC, userId: ctx.user.id },
    });
    return NextResponse.json({
      ok: true,
      requestId: data.request_id ?? data.id ?? "",
      status: data.status ?? "queued",
      model: MODEL,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await authenticate(req);
    if (isAuthResponse(ctx)) return ctx;
    const auth = authHeader();
    if (!auth) return NextResponse.json({ error: "HIGGSFIELD credentials missing" }, { status: 500 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const res = await fetch(`${BASE}/requests/${id}/status`, { headers: { Authorization: auth } });
    if (!res.ok) {
      return NextResponse.json({ error: `poll ${res.status}` }, { status: 500 });
    }
    const data = await res.json();
    return NextResponse.json({
      status: data.status ?? "in_progress",
      progress: data.progress ?? null,
      videoUrl: data.video?.url ?? null,
      error: data.error ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 400) }, { status: 500 });
  }
}
