import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { AudienceInsights } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_audience_insights"); if (f) return f;
    const insight = await AudienceInsights.analyzeComments(params.id);
    return ok({ jobId: `inline-${Date.now()}`, insight });
  } catch (e) { return handleError(e); }
}
