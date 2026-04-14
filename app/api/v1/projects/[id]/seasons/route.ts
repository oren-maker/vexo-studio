/**
 * Project-as-series view: returns a single auto-resolved series and its seasons,
 * each with episode count and progress %. Auto-creates a default series if none.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticate, requirePermission, isAuthResponse } from "@/lib/auth";
import { assertProjectInOrg } from "@/lib/plan-limits";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const Body = z.object({
  seasonNumber: z.number().int().positive().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  targetDurationMinutes: z.number().int().optional(),
  releaseYear: z.number().int().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const project = await assertProjectInOrg(params.id, ctx.organizationId);

    let series = await prisma.series.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } });
    if (!series) {
      series = await prisma.series.create({ data: { projectId: project.id, title: project.name } });
    }

    const seasons = await prisma.season.findMany({
      where: { seriesId: series.id },
      orderBy: { seasonNumber: "asc" },
      include: {
        episodes: {
          orderBy: { episodeNumber: "asc" },
          select: {
            id: true, episodeNumber: true, title: true, status: true,
            scenes: { select: { status: true, scriptText: true, frames: { select: { generatedImageUrl: true, approvedImageUrl: true } } } },
          },
        },
      },
    });

    return ok({ project: { id: project.id, name: project.name, contentType: project.contentType, status: project.status }, series, seasons });
  } catch (e) { return handleError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    const f = requirePermission(ctx, "edit_project"); if (f) return f;
    await assertProjectInOrg(params.id, ctx.organizationId);
    const body = req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0
      ? Body.parse(await req.json()) : Body.parse({});

    let series = await prisma.series.findFirst({ where: { projectId: params.id }, orderBy: { createdAt: "asc" } });
    if (!series) {
      const project = await prisma.project.findUniqueOrThrow({ where: { id: params.id } });
      series = await prisma.series.create({ data: { projectId: params.id, title: project.name } });
    }

    const last = await prisma.season.findFirst({ where: { seriesId: series.id }, orderBy: { seasonNumber: "desc" } });
    const num = body.seasonNumber ?? (last?.seasonNumber ?? 0) + 1;
    const season = await prisma.season.create({
      data: {
        seriesId: series.id,
        seasonNumber: num,
        title: body.title ?? `Season ${num}`,
        description: body.description,
        targetDurationMinutes: body.targetDurationMinutes,
        releaseYear: body.releaseYear,
      },
    });
    return ok(season, 201);
  } catch (e) { return handleError(e); }
}
