import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

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
