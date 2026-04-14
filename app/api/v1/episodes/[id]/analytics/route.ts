import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const ep = await prisma.episode.findFirst({ where: { id: params.id, season: { series: { project: { organizationId: ctx.organizationId } } } } });
    if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
    return ok(await prisma.analyticsSnapshot.findMany({ where: { episodeId: params.id }, orderBy: { capturedAt: "desc" }, take: 100 }));
  } catch (e) { return handleError(e); }
}
