import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { auditLog } from "@/lib/audit";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const RevenueCreate = z.object({
  entityType: z.string(), entityId: z.string(), platform: z.string(),
  sourceType: z.enum(["AD","SUBSCRIPTION","SPONSORSHIP","OTHER"]),
  description: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: z.string().default("USD"),
  occurredAt: z.string().datetime(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.revenueEntry.findMany({ where: { projectId: params.id }, orderBy: { occurredAt: "desc" }, take: 200 }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = RevenueCreate.parse(await req.json());
    const created = await prisma.revenueEntry.create({ data: { ...body, projectId: params.id, occurredAt: new Date(body.occurredAt) } });
    await auditLog({ organizationId: ctx.organizationId, actorUserId: ctx.user.id, entityType: "REVENUE_ENTRY", entityId: created.id, action: "CREATE", newValue: created });
    return ok(created, 201);
  } catch (e) { return handleError(e); }
}
