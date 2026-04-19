import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isAuthResponse } from "@/lib/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs";

// Aggregated project dashboard data: series/season/episode/scene counts +
// status breakdowns + spend + top characters + recent activity. One
// roundtrip replaces 6 separate dashboard widgets.

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await authenticate(req); if (isAuthResponse(ctx)) return ctx;
    void ctx;

    const [project, seriesList, sceneStatuses, episodeStatuses, charCount, totalCost, recentCosts, lastActivity] = await Promise.all([
      prisma.project.findUnique({
        where: { id: params.id },
        select: { id: true, name: true, plannedBudget: true, status: true, genreTag: true, contentType: true },
      }),
      prisma.series.findMany({
        where: { projectId: params.id },
        include: {
          seasons: {
            select: { id: true, seasonNumber: true, episodes: { select: { id: true, status: true } } },
          },
        },
      }),
      prisma.scene.groupBy({
        by: ["status"],
        where: { episode: { season: { series: { projectId: params.id } } } },
        _count: { _all: true },
      }),
      prisma.episode.groupBy({
        by: ["status"],
        where: { season: { series: { projectId: params.id } } },
        _count: { _all: true },
      }),
      prisma.character.count({ where: { projectId: params.id } }),
      prisma.costEntry.aggregate({
        where: { projectId: params.id },
        _sum: { totalCost: true },
        _count: true,
      }),
      prisma.costEntry.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, totalCost: true, description: true, costCategory: true },
      }),
      prisma.scene.findFirst({
        where: { episode: { season: { series: { projectId: params.id } } } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, sceneNumber: true, title: true, status: true, updatedAt: true, episode: { select: { seasonId: true, episodeNumber: true, title: true } } },
      }),
    ]);

    if (!project) throw Object.assign(new Error("project not found"), { statusCode: 404 });

    const totalSeasons = seriesList.reduce((s, sr) => s + sr.seasons.length, 0);
    const totalEpisodes = seriesList.reduce((s, sr) => s + sr.seasons.reduce((t, se) => t + se.episodes.length, 0), 0);
    const totalScenes = sceneStatuses.reduce((s, b) => s + b._count._all, 0);
    const spend = totalCost._sum.totalCost ?? 0;
    const budget = project.plannedBudget ?? 0;

    return ok({
      project,
      metrics: {
        seriesCount: seriesList.length,
        totalSeasons,
        totalEpisodes,
        totalScenes,
        charCount,
        spend: +spend.toFixed(4),
        budget,
        budgetUsagePct: budget > 0 ? +((spend / budget) * 100).toFixed(1) : null,
        costEntryCount: totalCost._count,
      },
      sceneStatuses: sceneStatuses.map((r) => ({ status: r.status, count: r._count._all })),
      episodeStatuses: episodeStatuses.map((r) => ({ status: r.status, count: r._count._all })),
      seriesList: seriesList.map((sr) => ({
        id: sr.id,
        title: sr.title,
        seasonCount: sr.seasons.length,
        episodeCount: sr.seasons.reduce((t, se) => t + se.episodes.length, 0),
      })),
      recentCosts,
      lastActivity,
    });
  } catch (e) { return handleError(e); }
}
