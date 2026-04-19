import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve the best available thumbnail for a scene — in priority order:
//   1. Latest READY video Asset thumbnailUrl / fileUrl-as-poster
//   2. memoryContext.bridgeFrameUrl (approval-time last-frame)
//   3. First SceneFrame.approvedImageUrl
//   4. null
// Kept tiny so the chat UI can batch-fetch thumbs for 5+ scenes without latency.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;

  const scene = await prisma.scene.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      sceneNumber: true,
      memoryContext: true,
      frames: { select: { approvedImageUrl: true, generatedImageUrl: true }, orderBy: { orderIndex: "asc" }, take: 1 },
    },
  });
  if (!scene) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  // 1. Latest video thumbnail
  const video = await prisma.asset.findFirst({
    where: { entityType: "SCENE", entityId: params.id, assetType: "VIDEO", status: "READY" },
    orderBy: { createdAt: "desc" },
    select: { thumbnailUrl: true, fileUrl: true, metadata: true },
  });
  if (video?.thumbnailUrl) {
    return NextResponse.json({ ok: true, url: video.thumbnailUrl, sceneNumber: scene.sceneNumber, kind: "video-thumb" });
  }

  // 2. Bridge frame (last-frame captured at scene approval)
  const mem = (scene.memoryContext as Record<string, unknown> | null) ?? {};
  const bridge = typeof mem.bridgeFrameUrl === "string" ? mem.bridgeFrameUrl : null;
  if (bridge) {
    return NextResponse.json({ ok: true, url: bridge, sceneNumber: scene.sceneNumber, kind: "bridge-frame" });
  }

  // 3. First storyboard frame
  const frame = scene.frames[0];
  const frameUrl = frame?.approvedImageUrl ?? frame?.generatedImageUrl ?? null;
  if (frameUrl) {
    return NextResponse.json({ ok: true, url: frameUrl, sceneNumber: scene.sceneNumber, kind: "storyboard-frame" });
  }

  // 4. Video fileUrl itself (will need a frame extracted client-side)
  if (video?.fileUrl) {
    return NextResponse.json({ ok: true, url: video.fileUrl, sceneNumber: scene.sceneNumber, kind: "video-file" });
  }

  return NextResponse.json({ ok: true, url: null, sceneNumber: scene.sceneNumber, kind: "none" });
}
