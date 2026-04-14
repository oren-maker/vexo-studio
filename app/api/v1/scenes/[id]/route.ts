import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SceneUpdate = z.object({
  title: z.string().optional(), summary: z.string().optional(),
  scriptText: z.string().optional(), targetDurationSeconds: z.number().int().optional(),
  status: z.enum(["DRAFT","PLANNING","STORYBOARD_GENERATING","STORYBOARD_REVIEW","STORYBOARD_APPROVED","VIDEO_GENERATING","VIDEO_REVIEW","APPROVED","LOCKED"]).optional(),
}).partial();

async function assertSceneInOrg(id: string, orgId: string) {
  const s = await prisma.scene.findFirst({
    where: {
      id, OR: [
        { episode: { season: { series: { project: { organizationId: orgId } } } } },
        { lesson: { module: { course: { project: { organizationId: orgId } } } } },
      ],
    },
  });
  if (!s) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertSceneInOrg(params.id, ctx.organizationId);
    const scene = await prisma.scene.findUnique({
      where: { id: params.id },
      include: { frames: { orderBy: { orderIndex: "asc" } }, criticReviews: true, comments: true },
    });
    if (!scene) return ok(null);

    // Per-frame cost + model annotation for the scene page
    const frameIds = scene.frames.map((f) => f.id);
    const frameCosts = frameIds.length > 0
      ? await prisma.costEntry.findMany({ where: { entityType: "FRAME", entityId: { in: frameIds } } })
      : [];
    const costByFrame = new Map<string, { cost: number; model?: string; description?: string; createdAt?: Date }>();
    for (const c of frameCosts) {
      const cur = costByFrame.get(c.entityId) ?? { cost: 0 };
      cur.cost += c.totalCost;
      const meta = (c.meta as { model?: string } | null) ?? {};
      // Prefer the latest model used (regen overwrites)
      if (!cur.createdAt || c.createdAt > cur.createdAt) {
        cur.model = meta.model ?? cur.model;
        cur.description = c.description ?? cur.description;
        cur.createdAt = c.createdAt;
      }
      costByFrame.set(c.entityId, cur);
    }
    const framesWithCost = scene.frames.map((f) => {
      const ci = costByFrame.get(f.id);
      return {
        ...f,
        cost: ci?.cost ? +ci.cost.toFixed(4) : 0,
        model: ci?.model ?? (ci?.description?.includes("nano-banana") ? "nano-banana" : undefined),
        lastChargedAt: ci?.createdAt ?? null,
      };
    });

    let sceneCharacters: unknown[] = [];
    if (scene.episodeId) {
      const ep = await prisma.episode.findUnique({
        where: { id: scene.episodeId },
        select: { season: { select: { series: { select: { projectId: true } } } } },
      });
      const projectId = ep?.season.series.projectId;
      if (projectId) {
        const mem = (scene.memoryContext as { characters?: string[] } | null) ?? {};
        const names = (mem.characters ?? []).map((n) => n.toLowerCase().trim());
        if (names.length > 0) {
          const all = await prisma.character.findMany({
            where: { projectId },
            include: { media: { take: 1, orderBy: { createdAt: "asc" } } },
          });
          sceneCharacters = all.filter((c) => names.includes(c.name.toLowerCase().trim()));
        }
      }
    }
    return ok({ ...scene, frames: framesWithCost, sceneCharacters });
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSceneInOrg(params.id, ctx.organizationId);
    return ok(await prisma.scene.update({ where: { id: params.id }, data: SceneUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}
