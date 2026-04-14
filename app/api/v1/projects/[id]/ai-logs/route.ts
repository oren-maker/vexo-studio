import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_logs"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.aILog.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }));
  } catch (e) { return handleError(e); }
}
