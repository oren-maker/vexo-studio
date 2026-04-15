import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/learn/auth";

// Client-side direct upload to Vercel Blob. Returns a signed URL the browser can PUT to.
export async function POST(request: Request): Promise<NextResponse> {
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/mp4", "video/webm", "video/quicktime"],
        maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
        tokenPayload: JSON.stringify({ at: Date.now() }),
      }),
      onUploadCompleted: async () => {
        // Could trigger pipeline here once blobUrl is known.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e: any) {
    console.error("[upload]", e);
    return NextResponse.json({ error: "upload failed" }, { status: 400 });
  }
}
