import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const ep = await prisma.episode.findFirst({ where: { id: params.id, season: { series: { project: { organizationId: ctx.organizationId } } } } });
    if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
    return ok(await prisma.episode.update({ where: { id: ep.id }, data: { exportStatus: "QUEUED" } }));
  } catch (e) { return handleError(e); }
}
