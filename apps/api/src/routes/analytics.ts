import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";
import { Revenue, AudienceInsights } from "../services";
import { assertProjectInOrg } from "../lib/plan-limits";

async function assertSeriesInOrg(id: string, orgId: string) {
  const s = await prisma.series.findFirst({ where: { id, project: { organizationId: orgId } } });
  if (!s) throw Object.assign(new Error("series not found"), { statusCode: 404 });
  return s;
}
async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/projects/:id/analytics", { preHandler: [app.requireAuth] }, async (req) => {
    await assertProjectInOrg(req.params.id, req.organizationId!);
    const [profit, roi, revenue, costs] = await Promise.all([
      Revenue.calculateProfit(req.params.id),
      Revenue.calculateROI(req.params.id),
      prisma.revenueEntry.aggregate({ where: { projectId: req.params.id }, _sum: { amount: true } }),
      prisma.costEntry.aggregate({ where: { projectId: req.params.id }, _sum: { totalCost: true } }),
    ]);
    return { profit, roi, revenue: revenue._sum.amount ?? 0, cost: costs._sum.totalCost ?? 0 };
  });

  app.get<{ Params: { id: string } }>("/series/:id/dashboard", { preHandler: [app.requireAuth] }, async (req) => {
    const s = await assertSeriesInOrg(req.params.id, req.organizationId!);
    const episodes = await Revenue.aggregateByEpisode(s.id);
    return { series: s, episodes };
  });

  app.get<{ Params: { id: string } }>("/episodes/:id/analytics", { preHandler: [app.requireAuth] }, async (req) => {
    await assertEpisodeInOrg(req.params.id, req.organizationId!);
    return prisma.analyticsSnapshot.findMany({ where: { episodeId: req.params.id }, orderBy: { capturedAt: "desc" }, take: 100 });
  });

  app.post<{ Params: { id: string } }>(
    "/episodes/:id/analytics/insights",
    { preHandler: [app.requirePermission("view_audience_insights")] },
    async (req) => {
      await assertEpisodeInOrg(req.params.id, req.organizationId!);
      const job = await getQueue(QUEUE_NAMES.AUDIENCE_INSIGHTS).add("insights", { episodeId: req.params.id, organizationId: req.organizationId });
      const inline = await AudienceInsights.analyzeComments(req.params.id);
      return { jobId: job.id, insight: inline };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/projects/:id/audience-insights",
    { preHandler: [app.requirePermission("view_audience_insights")] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.audienceInsight.findMany({ where: { projectId: req.params.id }, orderBy: { generatedAt: "desc" }, take: 50 });
    },
  );
};
