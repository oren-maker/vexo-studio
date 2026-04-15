/**
 * Token issuer for client-side direct-uploads to Vercel Blob.
 * Required by @vercel/blob/client `upload()` to gate who can upload.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ["video/mp4"],
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ orgId: ctx.organizationId, pathname }),
      }),
      onUploadCompleted: async () => { /* nothing extra; route POST stores Asset */ },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
