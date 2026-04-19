import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Scene version history — returns SceneVersion snapshots + current scriptText
// so the diff UI can compare any two points in time. Sorted newest-first.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const scene = await prisma.scene.findUnique({
      where: { id: params.id },
      select: { id: true, scriptText: true, updatedAt: true, scriptSource: true },
    });
    if (!scene) return ok(null);
    const versions = await prisma.sceneVersion.findMany({
      where: { sceneId: params.id },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, scriptSnapshot: true, reviewNotes: true, createdAt: true, createdByUserId: true },
      take: 50,
    });
    return ok({
      current: { scriptText: scene.scriptText, scriptSource: scene.scriptSource, updatedAt: scene.updatedAt },
      versions,
    });
  } catch (e) { return handleError(e); }
}
