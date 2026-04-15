import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/learn/auth";

export async function POST(request: Request): Promise<NextResponse> {
  const unauth = await requireAdmin(request);
  if (unauth) return unauth;
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ at: Date.now() }),
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (e: any) {
    console.error("[guides upload]", e);
    return NextResponse.json({ error: "upload failed" }, { status: 400 });
  }
}
