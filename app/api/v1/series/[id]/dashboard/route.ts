import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { Revenue } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const s = await prisma.series.findFirst({ where: { id: params.id, project: { organizationId: ctx.organizationId } } });
    if (!s) throw Object.assign(new Error("series not found"), { statusCode: 404 });
    const episodes = await Revenue.aggregateByEpisode(s.id);
    return ok({ series: s, episodes });
  } catch (e) { return handleError(e); }
}
