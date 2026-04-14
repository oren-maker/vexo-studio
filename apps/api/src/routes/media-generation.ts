import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";
import { Dialogue } from "../services";

export const mediaGenerationRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { sceneId: string } }>(
    "/scenes/:sceneId/music/generate",
    { preHandler: [app.requirePermission("manage_music")] },
    async (req) => {
      const job = await getQueue(QUEUE_NAMES.MUSIC).add("music", { sceneId: req.params.sceneId, organizationId: req.organizationId, body: req.body });
      return { jobId: job.id };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/music/:id",
    { preHandler: [app.requirePermission("manage_music")] },
    async (req) => prisma.musicTrack.update({ where: { id: req.params.id }, data: req.body as object }),
  );

  app.post<{ Params: { id: string } }>(
    "/episodes/:id/subtitles/generate",
    { preHandler: [app.requirePermission("manage_subtitles")] },
    async (req) => {
      const job = await getQueue(QUEUE_NAMES.SUBTITLE).add("subtitle", { episodeId: req.params.id, organizationId: req.organizationId, body: req.body });
      return { jobId: job.id };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/episodes/:id/dubbing/generate",
    { preHandler: [app.requirePermission("manage_dubbing")] },
    async (req) => {
      const job = await getQueue(QUEUE_NAMES.DUBBING).add("dubbing", { episodeId: req.params.id, organizationId: req.organizationId, body: req.body });
      return { jobId: job.id };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/scenes/:id/lipsync/generate",
    { preHandler: [app.requirePermission("generate_assets")] },
    async (req) => {
      const job = await getQueue(QUEUE_NAMES.LIPSYNC).add("lipsync", { sceneId: req.params.id, organizationId: req.organizationId, body: req.body });
      return { jobId: job.id };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/scenes/:id/dialogue/generate",
    { preHandler: [app.requirePermission("generate_assets")] },
    async (req) => {
      await Dialogue.generateDialogue(req.params.id);
      const job = await getQueue(QUEUE_NAMES.DIALOGUE).add("dialogue", { sceneId: req.params.id, organizationId: req.organizationId });
      return { jobId: job.id };
    },
  );
};
