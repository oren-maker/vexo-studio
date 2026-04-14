import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { Revenue } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const [profit, roi, splits] = await Promise.all([
      Revenue.calculateProfit(params.id),
      Revenue.calculateROI(params.id),
      Revenue.calculateSplitPayouts(params.id),
    ]);
    return ok({ profit, roi, splits });
  } catch (e) { return handleError(e); }
}
