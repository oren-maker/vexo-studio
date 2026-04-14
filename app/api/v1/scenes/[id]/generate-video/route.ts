import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { CostStrategy } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "generate_assets"); if (f) return f;
    const scene = await prisma.scene.findFirst({ where: { id: params.id } });
    if (!scene) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
    if (scene.status !== "STORYBOARD_APPROVED") throw Object.assign(new Error("storyboard not approved"), { statusCode: 409 });
    const estimate = await CostStrategy.estimateSceneVideoCost(scene.id);
    await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_REVIEW" } });
    return ok({ jobId: `inline-${Date.now()}`, estimate });
  } catch (e) { return handleError(e); }
}
