import { NextRequest } from "next/server";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { AIDirector } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_ai_director"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await AIDirector.runNextStep(params.id));
  } catch (e) { return handleError(e); }
}
