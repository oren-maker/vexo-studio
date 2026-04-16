import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "approve_scene"); if (f) return f;
    const updated = await prisma.scene.update({ where: { id: params.id }, data: { status: "APPROVED" } });
    await (prisma as any).sceneLog.create({
      data: {
        sceneId: params.id,
        action: "scene_approved",
        actor: `user:${ctx.user.id}`,
        actorName: ctx.user.fullName ?? ctx.user.email,
      },
    }).catch(() => {});
    return ok(updated);
  } catch (e) { return handleError(e); }
}
