import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SeasonCreate = z.object({
  seasonNumber: z.number().int().positive(),
  title: z.string().optional(), description: z.string().optional(),
  targetDurationMinutes: z.number().int().optional(), releaseYear: z.number().int().optional(),
});

async function assertSeriesInOrg(id: string, orgId: string) {
  const s = await prisma.series.findFirst({ where: { id, project: { organizationId: orgId } } });
  if (!s) throw Object.assign(new Error("series not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertSeriesInOrg(params.id, ctx.organizationId);
    return ok(await prisma.season.findMany({ where: { seriesId: params.id }, orderBy: { seasonNumber: "asc" } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSeriesInOrg(params.id, ctx.organizationId);
    const body = SeasonCreate.parse(await req.json());
    return ok(await prisma.season.create({ data: { ...body, seriesId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
