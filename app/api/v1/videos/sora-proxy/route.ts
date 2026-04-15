/**
 * GET /api/v1/videos/sora-proxy?id=<video_xxx>
 * Streams an OpenAI Sora-2 MP4 to an authenticated browser. The Sora /content
 * endpoint requires the OPENAI_API_KEY, so the <video> tag can't hit it
 * directly — we proxy with our server key.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { downloadSoraVideo } from "@/lib/providers/openai-sora";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !id.startsWith("video_")) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  try {
    const { bytes, mimeType } = await downloadSoraVideo(id);
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": bytes.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
