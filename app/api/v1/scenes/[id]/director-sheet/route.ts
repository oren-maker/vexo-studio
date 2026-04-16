import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { buildDirectorSheet } from "@/lib/director-sheet";
import { prisma } from "@/lib/prisma";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const sheet = await buildDirectorSheet(params.id);
    // SceneLog
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "director_sheet_generated",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: {},
      },
    }).catch(() => {});
    // CostEntry — Groq text-AI call, ~$0.005 estimated
    const scene = await prisma.scene.findUnique({ where: { id: params.id }, include: { episode: { include: { season: { include: { series: true } } } } } });
    const projectId = scene?.episode?.season?.series?.projectId;
    if (projectId) {
      await chargeUsd({
        organizationId: ctx.organizationId, projectId,
        entityType: "SCENE", entityId: params.id,
        providerName: "Groq", category: "TOKEN",
        description: `Director Sheet · scene ${scene?.sceneNumber ?? "?"}`,
        unitCost: 0.005, quantity: 1, userId: ctx.user.id,
      }).catch(() => {});
    }
    return ok({ sceneId: params.id, sheet });
  } catch (e) { return handleError(e); }
}
