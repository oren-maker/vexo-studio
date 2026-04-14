import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const SeasonUpdate = z.object({
  title: z.string().optional(), description: z.string().optional(),
  targetDurationMinutes: z.number().int().optional(), releaseYear: z.number().int().optional(),
}).partial();

async function assertSeasonInOrg(id: string, orgId: string) {
  const s = await prisma.season.findFirst({ where: { id, series: { project: { organizationId: orgId } } }, include: { series: true } });
  if (!s) throw Object.assign(new Error("season not found"), { statusCode: 404 });
  return s;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertSeasonInOrg(params.id, ctx.organizationId);
    return ok(await prisma.season.update({ where: { id: params.id }, data: SeasonUpdate.parse(await req.json()) }));
  } catch (e) { return handleError(e); }
}
