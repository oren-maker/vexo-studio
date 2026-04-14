import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { Revenue } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const [profit, roi, revenue, costs] = await Promise.all([
      Revenue.calculateProfit(params.id),
      Revenue.calculateROI(params.id),
      prisma.revenueEntry.aggregate({ where: { projectId: params.id }, _sum: { amount: true } }),
      prisma.costEntry.aggregate({ where: { projectId: params.id }, _sum: { totalCost: true } }),
    ]);
    return ok({ profit, roi, revenue: revenue._sum.amount ?? 0, cost: costs._sum.totalCost ?? 0 });
  } catch (e) { return handleError(e); }
}
