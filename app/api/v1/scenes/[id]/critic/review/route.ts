import { NextRequest } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { AICritic } from "@/lib/services";
import { prisma } from "@/lib/prisma";
import { chargeUsd } from "@/lib/billing";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const result = await AICritic.reviewScene(params.id);
    // SceneLog
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "critic_review",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { score: (result as any)?.score ?? null, feedbackPreview: String((result as any)?.feedback ?? "").slice(0, 200) },
      },
    }).catch(() => {});
    // CostEntry — Groq text-AI call, ~$0.003 estimated
    const scene = await prisma.scene.findUnique({ where: { id: params.id }, include: { episode: { include: { season: { include: { series: true } } } } } });
    const projectId = scene?.episode?.season?.series?.projectId;
    if (projectId) {
      await chargeUsd({
        organizationId: ctx.organizationId, projectId,
        entityType: "SCENE", entityId: params.id,
        providerName: "Groq", category: "TOKEN",
        description: `AI Critic · scene ${scene?.sceneNumber ?? "?"}`,
        unitCost: 0.003, quantity: 1, userId: ctx.user.id,
      }).catch(() => {});
    }
    return ok(result);
  } catch (e) { return handleError(e); }
}
