/**
 * POST /api/v1/scenes/[id]/set-active-video
 * Body: { assetId }
 * Marks one VIDEO asset on the scene as `metadata.isPrimary=true` and clears
 * the flag on every other VIDEO asset for that scene. The scene GET sorts
 * primary first so the chosen video plays as the main one.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({ assetId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const body = Body.parse(await req.json());

    const scene = await prisma.scene.findFirst({
      where: {
        id: params.id, OR: [
          { episode: { season: { series: { project: { organizationId: ctx.organizationId } } } } },
          { lesson: { module: { course: { project: { organizationId: ctx.organizationId } } } } },
        ],
      },
      select: { id: true },
    });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });

    const target = await prisma.asset.findFirst({
      where: { id: body.assetId, entityType: "SCENE", entityId: scene.id, assetType: "VIDEO" },
    });
    if (!target) throw Object.assign(new Error("asset not found for this scene"), { statusCode: 404 });

    const all = await prisma.asset.findMany({
      where: { entityType: "SCENE", entityId: scene.id, assetType: "VIDEO" },
      select: { id: true, metadata: true },
    });

    await Promise.all(all.map((a) => {
      const meta = (a.metadata as Record<string, unknown> | null) ?? {};
      const isPrimary = a.id === target.id;
      return prisma.asset.update({
        where: { id: a.id },
        data: { metadata: { ...meta, isPrimary } as object },
      });
    }));

    // SceneLog
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: scene.id,
        action: "video_set_primary",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { assetId: target.id },
      },
    }).catch(() => {});
    return ok({ assetId: target.id, isPrimary: true });
  } catch (e) { return handleError(e); }
}
