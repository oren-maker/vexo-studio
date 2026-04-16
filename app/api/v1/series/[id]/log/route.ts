import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/learn/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  // Get all scene IDs under this series (series → seasons → episodes → scenes)
  const scenes = await prisma.scene.findMany({
    where: { episode: { season: { seriesId: params.id } } },
    select: { id: true },
  });
  const sceneIds = scenes.map((s) => s.id);
  if (sceneIds.length === 0) return NextResponse.json({ logs: [] });

  const logs = await (prisma as any).sceneLog.findMany({
    where: { sceneId: { in: sceneIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ logs });
}
