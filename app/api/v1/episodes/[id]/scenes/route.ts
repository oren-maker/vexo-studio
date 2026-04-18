import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SceneCreate = z.object({
  sceneNumber: z.number().int().positive(), title: z.string().optional(),
  summary: z.string().optional(), scriptText: z.string().optional(),
  targetDurationSeconds: z.number().int().optional(),
});

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    const scenes = await prisma.scene.findMany({
      where: { episodeId: params.id },
      orderBy: { sceneNumber: "asc" },
      include: { _count: { select: { frames: true } } },
    });
    // Scene.actualCost is never populated — the UI list was showing $0.00
    // for every scene. Compute live from CostEntry per-scene and override.
    // Grouped aggregation by entityId (sceneId) keeps this to one round-trip.
    if (scenes.length > 0) {
      const agg = await prisma.costEntry.groupBy({
        by: ["entityId"],
        where: { entityType: "SCENE", entityId: { in: scenes.map((s) => s.id) } },
        _sum: { totalCost: true },
      });
      const costBySceneId = new Map<string, number>();
      for (const row of agg) costBySceneId.set(row.entityId, row._sum.totalCost ?? 0);
      for (const s of scenes) {
        (s as unknown as { actualCost: number }).actualCost = +(costBySceneId.get(s.id) ?? 0).toFixed(4);
      }
    }
    return ok(scenes);
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertEpisodeInOrg(params.id, ctx.organizationId);
    const body = SceneCreate.parse(await req.json());
    return ok(await prisma.scene.create({
      data: { ...body, parentType: "EPISODE", parentId: params.id, episodeId: params.id },
    }), 201);
  } catch (e) { return handleError(e); }
}
