import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/learn/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: finds a real episode, shows its scenes (id + scriptText length + first 50 chars),
// so we can verify what the overwrite logic would do.
export async function GET(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  const url = new URL(req.url);
  const episodeId = url.searchParams.get("episodeId");

  if (!episodeId) {
    // No episode specified — list first 3 episodes with their scene counts
    const eps = await (prisma as any).episode?.findMany({
      take: 3,
      orderBy: { createdAt: "desc" },
      select: { id: true, episodeNumber: true, title: true, _count: { select: { scenes: true } } },
    });
    return NextResponse.json({ episodes: eps });
  }

  const scenes = await prisma.scene.findMany({
    where: { episodeId },
    orderBy: { sceneNumber: "asc" },
    select: { id: true, sceneNumber: true, title: true, scriptText: true, scriptSource: true, updatedAt: true },
  });

  return NextResponse.json({
    episodeId,
    sceneCount: scenes.length,
    scenes: scenes.map((s) => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      title: s.title,
      scriptLen: (s.scriptText || "").length,
      scriptPreview: (s.scriptText || "").slice(0, 80),
      scriptSource: s.scriptSource,
      updatedAt: s.updatedAt,
    })),
  });
}
