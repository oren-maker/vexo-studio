import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { assertProjectInOrg, assertEpisodeQuota } from "../lib/plan-limits";

const SeriesCreate = z.object({
  title: z.string().min(2),
  summary: z.string().optional(),
  genre: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  totalBudget: z.number().positive().optional(),
});
const SeriesUpdate = SeriesCreate.partial();
const SeasonCreate = z.object({ seasonNumber: z.number().int().positive(), title: z.string().optional(), description: z.string().optional(), targetDurationMinutes: z.number().int().optional(), releaseYear: z.number().int().optional() });
const SeasonUpdate = SeasonCreate.partial();
const EpisodeCreate = z.object({ episodeNumber: z.number().int().positive(), title: z.string().min(1), synopsis: z.string().optional(), targetDurationSeconds: z.number().int().optional(), plannedBudget: z.number().optional() });
const EpisodeUpdate = EpisodeCreate.partial().extend({
  status: z.enum(["DRAFT","PLANNING","IN_PRODUCTION","REVIEW","READY_FOR_PUBLISH","PUBLISHED","ARCHIVED"]).optional(),
  scheduledPublishAt: z.string().datetime().optional(),
  seoTitle: z.string().optional(), seoDescription: z.string().optional(), seoTags: z.array(z.string()).optional(),
});

async function assertSeriesInOrg(seriesId: string, orgId: string) {
  const s = await prisma.series.findFirst({ where: { id: seriesId, project: { organizationId: orgId } }, include: { project: true } });
  if (!s) throw Object.assign(new Error("series not found"), { statusCode: 404 });
  return s;
}
async function assertSeasonInOrg(seasonId: string, orgId: string) {
  const s = await prisma.season.findFirst({ where: { id: seasonId, series: { project: { organizationId: orgId } } }, include: { series: true } });
  if (!s) throw Object.assign(new Error("season not found"), { statusCode: 404 });
  return s;
}
async function assertEpisodeInOrg(episodeId: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id: episodeId, season: { series: { project: { organizationId: orgId } } } }, include: { season: { include: { series: true } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export const seriesRoutes: FastifyPluginAsync = async (app) => {
  // ---- Series under project ----
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/series",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return prisma.series.findMany({ where: { projectId: req.params.projectId } });
    },
  );
  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/series",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req, reply) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      const body = SeriesCreate.parse(req.body);
      const created = await prisma.series.create({ data: { ...body, projectId: req.params.projectId } });
      reply.code(201);
      return created;
    },
  );
  app.get<{ Params: { id: string } }>("/series/:id", { preHandler: [app.requireAuth] }, async (req) => {
    return assertSeriesInOrg(req.params.id, req.organizationId!);
  });
  app.patch<{ Params: { id: string } }>("/series/:id", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    await assertSeriesInOrg(req.params.id, req.organizationId!);
    return prisma.series.update({ where: { id: req.params.id }, data: SeriesUpdate.parse(req.body) });
  });

  // ---- Seasons ----
  app.get<{ Params: { seriesId: string } }>("/series/:seriesId/seasons", { preHandler: [app.requireAuth] }, async (req) => {
    await assertSeriesInOrg(req.params.seriesId, req.organizationId!);
    return prisma.season.findMany({ where: { seriesId: req.params.seriesId }, orderBy: { seasonNumber: "asc" } });
  });
  app.post<{ Params: { seriesId: string } }>("/series/:seriesId/seasons", { preHandler: [app.requirePermission("edit_project")] }, async (req, reply) => {
    await assertSeriesInOrg(req.params.seriesId, req.organizationId!);
    const body = SeasonCreate.parse(req.body);
    const created = await prisma.season.create({ data: { ...body, seriesId: req.params.seriesId } });
    reply.code(201);
    return created;
  });
  app.patch<{ Params: { id: string } }>("/seasons/:id", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    await assertSeasonInOrg(req.params.id, req.organizationId!);
    return prisma.season.update({ where: { id: req.params.id }, data: SeasonUpdate.parse(req.body) });
  });

  // ---- Episodes ----
  app.get<{ Params: { seasonId: string } }>("/seasons/:seasonId/episodes", { preHandler: [app.requireAuth] }, async (req) => {
    await assertSeasonInOrg(req.params.seasonId, req.organizationId!);
    return prisma.episode.findMany({ where: { seasonId: req.params.seasonId }, orderBy: { episodeNumber: "asc" } });
  });
  app.post<{ Params: { seasonId: string } }>("/seasons/:seasonId/episodes", { preHandler: [app.requirePermission("edit_project")] }, async (req, reply) => {
    const season = await assertSeasonInOrg(req.params.seasonId, req.organizationId!);
    await assertEpisodeQuota(req.organizationId!, season.seriesId);
    const body = EpisodeCreate.parse(req.body);
    const created = await prisma.episode.create({ data: { ...body, seasonId: req.params.seasonId } });
    reply.code(201);
    return created;
  });
  app.get<{ Params: { id: string } }>("/episodes/:id", { preHandler: [app.requireAuth] }, async (req) => {
    return assertEpisodeInOrg(req.params.id, req.organizationId!);
  });
  app.patch<{ Params: { id: string } }>("/episodes/:id", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    await assertEpisodeInOrg(req.params.id, req.organizationId!);
    const body = EpisodeUpdate.parse(req.body);
    return prisma.episode.update({
      where: { id: req.params.id },
      data: { ...body, scheduledPublishAt: body.scheduledPublishAt ? new Date(body.scheduledPublishAt) : undefined },
    });
  });
  app.post<{ Params: { id: string } }>("/episodes/:id/export", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    const ep = await assertEpisodeInOrg(req.params.id, req.organizationId!);
    return prisma.episode.update({ where: { id: ep.id }, data: { exportStatus: "QUEUED" } });
  });
  app.post<{ Params: { id: string } }>("/episodes/:id/publish", { preHandler: [app.requirePermission("publish_episode"), app.rateLimit?.({ max: 10, timeWindow: "1 minute" }) ?? (async () => {})] }, async (req) => {
    const ep = await assertEpisodeInOrg(req.params.id, req.organizationId!);
    return prisma.episode.update({ where: { id: ep.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  });
  app.get<{ Params: { id: string } }>("/episodes/:id/preview", { preHandler: [app.requireAuth] }, async (req) => {
    const ep = await assertEpisodeInOrg(req.params.id, req.organizationId!);
    return { previewUrl: ep.previewVideoUrl ?? null };
  });
};
