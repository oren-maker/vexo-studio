import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";
import { encrypt } from "../lib/crypto";
import { assertProjectInOrg } from "../lib/plan-limits";

const ChannelConnect = z.object({
  channelName: z.string(),
  channelId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenExpiry: z.string().datetime().optional(),
});
const DistributionUpsert = z.object({
  platform: z.string().default("YOUTUBE"),
  channelIntegrationId: z.string().cuid(),
  publishingMode: z.enum(["MANUAL","SEMI_AUTO","FULL_AUTO"]).default("MANUAL"),
  autoPublishEnabled: z.boolean().default(false),
  defaultPrivacy: z.enum(["PUBLIC","UNLISTED","PRIVATE"]).default("PRIVATE"),
});

export const distributionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/integrations/channels", { preHandler: [app.requirePermission("manage_distribution")] }, async (req) =>
    prisma.channelIntegration.findMany({
      where: { organizationId: req.organizationId },
      select: { id: true, provider: true, channelName: true, channelId: true, tokenExpiry: true, isActive: true, createdAt: true },
    }),
  );

  app.post(
    "/integrations/youtube/connect",
    { preHandler: [app.requirePermission("manage_distribution")] },
    async (req, reply) => {
      const body = ChannelConnect.parse(req.body);
      const channel = await prisma.channelIntegration.create({
        data: {
          organizationId: req.organizationId!,
          provider: "YOUTUBE",
          channelName: body.channelName,
          channelId: body.channelId,
          accessTokenEncrypted: encrypt(body.accessToken),
          refreshTokenEncrypted: body.refreshToken ? encrypt(body.refreshToken) : null,
          tokenExpiry: body.tokenExpiry ? new Date(body.tokenExpiry) : null,
          createdByUserId: req.currentUser!.id,
        },
      });
      reply.code(201);
      return { id: channel.id };
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/distribution",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return prisma.projectDistribution.findMany({ where: { projectId: req.params.projectId } });
    },
  );

  app.patch<{ Params: { projectId: string } }>(
    "/projects/:projectId/distribution",
    { preHandler: [app.requirePermission("manage_distribution")] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      const body = DistributionUpsert.parse(req.body);
      return prisma.projectDistribution.upsert({
        where: { id: `${req.params.projectId}-${body.platform}` },
        update: body,
        create: { ...body, projectId: req.params.projectId, id: `${req.params.projectId}-${body.platform}` },
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/episodes/:id/publish/youtube",
    { preHandler: [app.requirePermission("publish_episode")], config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const ep = await prisma.episode.findFirst({
        where: { id: req.params.id, season: { series: { project: { organizationId: req.organizationId } } } },
      });
      if (!ep) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
      const job = await getQueue(QUEUE_NAMES.PUBLISHING).add("publish-yt", { episodeId: ep.id, organizationId: req.organizationId });
      return { jobId: job.id };
    },
  );
};
