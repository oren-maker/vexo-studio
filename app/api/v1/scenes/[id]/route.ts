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

    // Per-frame: cost = the LATEST generation only (the image you're looking at).
    // totalSpent = sum of all generations including regenerations (lifetime spend).
    const frameIds = scene.frames.map((f) => f.id);
    const frameCosts = frameIds.length > 0
      ? await prisma.costEntry.findMany({ where: { entityType: "FRAME", entityId: { in: frameIds } }, orderBy: { createdAt: "desc" } })
      : [];
    const acc = new Map<string, { latest?: typeof frameCosts[number]; total: number; count: number }>();
    for (const c of frameCosts) {
      const cur = acc.get(c.entityId) ?? { total: 0, count: 0 };
      if (!cur.latest) cur.latest = c; // first iteration = newest (orderBy desc)
      cur.total += c.totalCost;
      cur.count++;
      acc.set(c.entityId, cur);
    }
    const framesWithCost = scene.frames.map((f) => {
      const ci = acc.get(f.id);
      const latestMeta = (ci?.latest?.meta as { model?: string } | null) ?? {};
      return {
        ...f,
        cost: ci?.latest ? +ci.latest.totalCost.toFixed(4) : 0,
        totalSpent: ci ? +ci.total.toFixed(4) : 0,
        regenCount: ci ? ci.count : 0,
        model: latestMeta.model ?? (ci?.latest?.description?.includes("nano-banana") ? "nano-banana" : undefined),
        lastChargedAt: ci?.latest?.createdAt ?? null,
      };
    });

    // Scene-level videos (from fal webhooks) — Asset rows
    const videos = await prisma.asset.findMany({
      where: { entityType: "SCENE", entityId: params.id, assetType: "VIDEO", status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, fileUrl: true, createdAt: true, metadata: true },
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
    return ok({ ...scene, frames: framesWithCost, sceneCharacters, videos });
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
