import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertEpisodeQuota } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const EpisodeCreate = z.object({
  episodeNumber: z.number().int().positive(),
  title: z.string().min(1),
  synopsis: z.string().optional(),
  targetDurationSeconds: z.number().int().optional(),
  plannedBudget: z.number().optional(),
});

async function assertSeasonInOrg(id: string, orgId: string) {
  const s = await prisma.season.findFirst({ where: { id, series: { project: { organizationId: orgId } } }, include: { series: true } });
  if (!s) throw Object.assign(new Error("season not found"), { statusCode: 404 });
  return s;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    await assertSeasonInOrg(params.id, ctx.organizationId);
    return ok(await prisma.episode.findMany({ where: { seasonId: params.id }, orderBy: { episodeNumber: "asc" } }));
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    const season = await assertSeasonInOrg(params.id, ctx.organizationId);
    await assertEpisodeQuota(ctx.organizationId, season.seriesId);
    const body = EpisodeCreate.parse(await req.json());
    return ok(await prisma.episode.create({ data: { ...body, seasonId: params.id } }), 201);
  } catch (e) { return handleError(e); }
}
