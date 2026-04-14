import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SeriesCreate = z.object({
  title: z.string().min(2), summary: z.string().optional(),
  genre: z.string().optional(), coverImageUrl: z.string().url().optional(),
  totalBudget: z.number().positive().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertProjectInOrg(params.id, ctx.organizationId);
    return ok(await prisma.series.findMany({ where: { projectId: params.id } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = SeriesCreate.parse(await req.json());
    return ok(await prisma.series.create({ data: { ...body, projectId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
