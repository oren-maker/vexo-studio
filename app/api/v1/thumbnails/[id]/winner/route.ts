import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "publish_episode"); if (f) return f;
    const v = await prisma.thumbnailVariant.findFirst({ where: { id: params.id, episode: { season: { series: { project: { organizationId: ctx.organizationId } } } } } });
    if (!v) throw Object.assign(new Error("variant not found"), { statusCode: 404 });
    await prisma.thumbnailVariant.updateMany({ where: { episodeId: v.episodeId }, data: { isWinner: false } });
    return ok(await prisma.thumbnailVariant.update({ where: { id: v.id }, data: { isWinner: true } }));
  } catch (e) { return handleError(e); }
}
