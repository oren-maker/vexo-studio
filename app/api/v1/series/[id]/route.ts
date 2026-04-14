import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SeriesUpdate = z.object({
  title: z.string().min(2).optional(), summary: z.string().optional(),
  genre: z.string().optional(), coverImageUrl: z.string().url().optional(),
  totalBudget: z.number().positive().optional(),
});

async function assertSeriesInOrg(id: string, orgId: string) {
  const s = await prisma.series.findFirst({ where: { id, project: { organizationId: orgId } } });
  if (!s) throw Object.assign(new Error("series not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    return ok(await assertSeriesInOrg(params.id, ctx.organizationId));
  } catch (e) { return handleError(e); }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSeriesInOrg(params.id, ctx.organizationId);
    return ok(await prisma.series.update({ where: { id: params.id }, data: SeriesUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}
