import { NextRequest } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { AICritic } from "@/lib/services";
import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const result = await AICritic.reviewScene(params.id);
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "critic_review",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
        details: { score: (result as any)?.score ?? null, feedbackPreview: String((result as any)?.feedback ?? "").slice(0, 200) },
      },
    }).catch(() => {});
    return ok(result);
  } catch (e) { return handleError(e); }
}
