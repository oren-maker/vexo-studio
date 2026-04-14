import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { auditLog } from "@/lib/audit";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const CostCreate = z.object({
  entityType: z.string(), entityId: z.string(),
  costCategory: z.enum(["TOKEN","GENERATION","SERVER","STORAGE","MANUAL"]),
  description: z.string().optional(),
  unitCost: z.number().nonnegative(),
  quantity: z.number().positive().default(1),
  totalCost: z.number().nonnegative(),
  sourceType: z.enum(["JOB","MANUAL","SYSTEM"]).default("MANUAL"),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "view_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.costEntry.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 200 }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "manage_finance"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = CostCreate.parse(await req.json());
    const created = await prisma.costEntry.create({ data: { ...body, projectId: params.id, createdByUserId: ctx.user.id } });
    await auditLog({ organizationId: ctx.organizationId, actorUserId: ctx.user.id, entityType: "COST_ENTRY", entityId: created.id, action: "CREATE", newValue: created });
    return ok(created, 201);
  } catch (e) { return handleError(e); }
}
