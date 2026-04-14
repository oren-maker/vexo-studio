import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SplitCreate = z.object({
  entityType: z.string(), entityName: z.string(),
  percentage: z.number().min(0).max(100),
  payoutMethod: z.string().optional(), notes: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.revenueSplit.findMany({ where: { projectId: params.id } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = SplitCreate.parse(await req.json());
    return ok(await prisma.revenueSplit.create({ data: { ...body, projectId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
