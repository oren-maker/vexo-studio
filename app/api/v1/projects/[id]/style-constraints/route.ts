import { NextRequest } from "next/server";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { StyleEngine } from "@/lib/services";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok({ prompt: await StyleEngine.generateStyleConstraints(params.id) });
  } catch (e) { return handleError(e); }
}
