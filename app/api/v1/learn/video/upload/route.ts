import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/learn/auth";

// Vercel Blob client direct-upload handler for the video module.
// Independent from /api/learn/upload — different blob path prefix.
export async function POST(request: Request): Promise<NextResponse> {
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/mp3", "audio/wav"],
        maximumSizeInBytes: 500 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ at: Date.now() }),
      }),
      onUploadCompleted: async () => {
        // no-op — clip rows are created when the merge job is created
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e: any) {
    console.error("[video upload]", e);
    return NextResponse.json({ error: "upload failed" }, { status: 400 });
  }
}
