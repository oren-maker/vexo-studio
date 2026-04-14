import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";
import { CostStrategy, ScriptBreakdown, AICritic, StyleEngine } from "../services";

const SceneCreate = z.object({
  sceneNumber: z.number().int().positive(),
  title: z.string().optional(),
  summary: z.string().optional(),
  scriptText: z.string().optional(),
  targetDurationSeconds: z.number().int().optional(),
});
const SceneUpdate = SceneCreate.partial().extend({
  status: z.enum(["DRAFT","PLANNING","STORYBOARD_GENERATING","STORYBOARD_REVIEW","STORYBOARD_APPROVED","VIDEO_GENERATING","VIDEO_REVIEW","APPROVED","LOCKED"]).optional(),
});

async function assertEpisodeInOrg(episodeId: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id: episodeId, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}
async function assertSceneInOrg(sceneId: string, orgId: string) {
  const s = await prisma.scene.findFirst({
    where: {
      id: sceneId,
      OR: [
        { episode: { season: { series: { project: { organizationId: orgId } } } } },
        { lesson: { module: { course: { project: { organizationId: orgId } } } } },
      ],
    },
  });
  if (!s) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
  return s;
}

export const sceneRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { episodeId: string } }>("/episodes/:episodeId/scenes", { preHandler: [app.requireAuth] }, async (req) => {
    await assertEpisodeInOrg(req.params.episodeId, req.organizationId!);
    return prisma.scene.findMany({ where: { episodeId: req.params.episodeId }, orderBy: { sceneNumber: "asc" }, include: { frames: true } });
  });

  app.post<{ Params: { episodeId: string } }>("/episodes/:episodeId/scenes", { preHandler: [app.requirePermission("edit_project")] }, async (req, reply) => {
    await assertEpisodeInOrg(req.params.episodeId, req.organizationId!);
    const body = SceneCreate.parse(req.body);
    const scene = await prisma.scene.create({
      data: { ...body, parentType: "EPISODE", parentId: req.params.episodeId, episodeId: req.params.episodeId },
    });
    reply.code(201);
    return scene;
  });

  app.get<{ Params: { id: string } }>("/scenes/:id", { preHandler: [app.requireAuth] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return prisma.scene.findUnique({ where: { id: req.params.id }, include: { frames: { orderBy: { orderIndex: "asc" } }, criticReviews: true, comments: true } });
  });

  app.patch<{ Params: { id: string } }>("/scenes/:id", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return prisma.scene.update({ where: { id: req.params.id }, data: SceneUpdate.parse(req.body) });
  });

  app.post<{ Params: { id: string } }>("/scenes/:id/approve", { preHandler: [app.requirePermission("approve_scene")] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return prisma.scene.update({ where: { id: req.params.id }, data: { status: "APPROVED" } });
  });

  app.post<{ Params: { id: string } }>(
    "/scenes/:id/generate-storyboard",
    { preHandler: [app.requirePermission("generate_assets"), async (req) => { /* canAffordOperation check */ }] },
    async (req) => {
      const scene = await assertSceneInOrg(req.params.id, req.organizationId!);
      const estimate = await CostStrategy.estimateSceneStoryboardCost(scene.id);
      const projectId = (await prisma.episode.findUnique({ where: { id: scene.episodeId! }, include: { season: { include: { series: true } } } }))!.season.series.projectId;
      const stylePrompt = await StyleEngine.generateStyleConstraints(projectId);
      await prisma.scene.update({ where: { id: scene.id }, data: { status: "STORYBOARD_GENERATING", styleConstraints: stylePrompt ? { prompt: stylePrompt } as any : undefined } });
      const job = await getQueue(QUEUE_NAMES.STORYBOARD).add("storyboard", { sceneId: scene.id, organizationId: req.organizationId, estimate });
      return { jobId: job.id, estimate };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/scenes/:id/generate-video",
    { preHandler: [app.requirePermission("generate_assets")] },
    async (req) => {
      const scene = await assertSceneInOrg(req.params.id, req.organizationId!);
      if (scene.status !== "STORYBOARD_APPROVED") throw Object.assign(new Error("storyboard not approved"), { statusCode: 409 });
      const estimate = await CostStrategy.estimateSceneVideoCost(scene.id);
      await prisma.scene.update({ where: { id: scene.id }, data: { status: "VIDEO_GENERATING" } });
      const job = await getQueue(QUEUE_NAMES.VIDEO).add("video", { sceneId: scene.id, organizationId: req.organizationId, estimate });
      return { jobId: job.id, estimate };
    },
  );

  app.post<{ Params: { id: string } }>("/scenes/:id/breakdown", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return ScriptBreakdown.parseScript(req.params.id);
  });

  app.post<{ Params: { id: string } }>("/scenes/:id/critic/review", { preHandler: [app.requireAuth] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return AICritic.reviewScene(req.params.id);
  });
};
