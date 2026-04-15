/**
 * GET /api/v1/videos/veo-proxy?uri=<google-uri>
 * Proxies a Google-hosted VEO video file (auth-gated by the API key) to an
 * authenticated browser request. Used for <video> tags pointing at google-veo
 * results, since the underlying URI requires the API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { downloadVeoVideo } from "@/lib/providers/google-veo";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
  const uri = new URL(req.url).searchParams.get("uri");
  if (!uri || !uri.startsWith("https://generativelanguage.googleapis.com/")) {
    return NextResponse.json({ error: "invalid uri" }, { status: 400 });
  }
  try {
    const { bytes, mimeType } = await downloadVeoVideo(uri);
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
