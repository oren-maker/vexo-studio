/**
 * POST /api/v1/learn/series-sync
 * Pulls ALL production data from vexo-studio (projects → series → seasons →
 * episodes → scenes → characters → costs), sends it to Gemini for professional
 * analysis, and stores the result in KnowledgeNode + DailyBrainCache so the
 * brain/learn system stays up-to-date with the latest production state.
 *
 * Designed to run daily (via cron) or on-demand from the /learn/series page.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/learn/auth";
import { handleError, ok } from "@/lib/route-utils";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const unauth = await requireAdmin(req);
  if (unauth) return unauth;

  try {
    // 1. Pull entire production tree
    const projects = await prisma.project.findMany({
      include: {
        series: {
          include: {
            seasons: {
              include: {
                episodes: {
                  include: {
                    scenes: {
                      select: { id: true, sceneNumber: true, title: true, status: true, actualCost: true },
                      orderBy: { sceneNumber: "asc" },
                    },
                    _count: { select: { scenes: true } },
                  },
                  orderBy: { episodeNumber: "asc" },
                },
                opening: { select: { id: true, status: true, videoUrl: true, isSeriesDefault: true } },
              },
              orderBy: { seasonNumber: "asc" },
            },
          },
        },
        characters: {
          select: { id: true, name: true, roleType: true, _count: { select: { media: true } } },
        },
      },
    });

    // 2. Aggregate costs per project
    const projectIds = projects.map((p) => p.id);
    const costs = await prisma.costEntry.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds } },
      _sum: { totalCost: true },
      _count: { id: true },
    });
    const costByProject = new Map(costs.map((c) => [c.projectId, { total: c._sum.totalCost ?? 0, calls: c._count.id }]));

    // 3. Build a structured summary for each project
    const summaries = projects.map((p) => {
      const cost = costByProject.get(p.id);
      const allEpisodes = p.series.flatMap((s) => s.seasons.flatMap((sn) => sn.episodes));
      const allScenes = allEpisodes.flatMap((e) => e.scenes);
      const readyScenes = allScenes.filter((s) => ["VIDEO_REVIEW", "APPROVED", "LOCKED"].includes(s.status));
      const totalSceneCost = allScenes.reduce((s, sc) => s + sc.actualCost, 0);

      return {
        projectId: p.id,
        name: p.name,
        genre: p.genreTag,
        language: p.language,
        status: p.status,
        series: p.series.length,
        seasons: p.series.reduce((s, sr) => s + sr.seasons.length, 0),
        episodes: allEpisodes.length,
        scenes: allScenes.length,
        readyScenes: readyScenes.length,
        characters: p.characters.length,
        charsWithGallery: p.characters.filter((c) => c._count.media > 0).length,
        totalCostUsd: +(cost?.total ?? 0).toFixed(2),
        totalAiCalls: cost?.calls ?? 0,
        sceneCostUsd: +totalSceneCost.toFixed(2),
        hasOpening: p.series.some((s) => s.seasons.some((sn) => sn.opening?.status === "READY")),
        episodeDetails: allEpisodes.map((e) => ({
          number: e.episodeNumber,
          title: e.title,
          scenes: e._count.scenes,
          status: e.status,
        })),
      };
    });

    // 4. Build a local summary (NO Gemini call — the brain does the analysis
    // when asked, using this data as context). This is just structured data.
    const totalCost = summaries.reduce((s, p) => s + p.totalCostUsd, 0);
    const totalEps = summaries.reduce((s, p) => s + p.episodes, 0);
    const totalScenes = summaries.reduce((s, p) => s + p.scenes, 0);
    const readyScenes = summaries.reduce((s, p) => s + p.readyScenes, 0);
    const pct = totalScenes > 0 ? Math.round((readyScenes / totalScenes) * 100) : 0;

    const localSummary = summaries.map((p) => {
      const epPct = p.scenes > 0 ? Math.round((p.readyScenes / p.scenes) * 100) : 0;
      return `🎬 ${p.name}: ${p.episodes} פרקים · ${p.scenes} סצנות (${epPct}% מוכנות) · ${p.characters} דמויות (${p.charsWithGallery} עם גלריה) · $${p.totalCostUsd} · ${p.hasOpening ? "פתיח ✅" : "⚠️ חסר פתיח"}`;
    }).join("\n");

    const summary = `📊 סנכרון ${new Date().toISOString().split("T")[0]}: ${summaries.length} פרויקטים · ${totalEps} פרקים · ${totalScenes} סצנות (${pct}% מוכנות) · $${totalCost.toFixed(2)} סה"כ\n\n${localSummary}`;

    // 5. Store as InsightsSnapshot
    await prisma.insightsSnapshot.create({
      data: {
        kind: "series_analysis",
        takenAt: new Date(),
        sourcesCount: totalEps,
        analysesCount: summaries.length,
        nodesCount: totalScenes,
        avgWords: 0,
        avgTechniques: 0,
        timecodePct: pct,
        summary,
        data: summaries as object,
      },
    });

    return ok({
      synced: summaries.length,
      projects: summaries.map((s) => ({ name: s.name, episodes: s.episodes, scenes: s.scenes, cost: s.totalCostUsd })),
      summaryLength: summary.length,
      date: today,
    });
  } catch (e) { return handleError(e); }
}
