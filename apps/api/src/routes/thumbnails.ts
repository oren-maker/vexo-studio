import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";

const VariantCreate = z.object({ assetId: z.string().cuid(), label: z.string().min(1) });

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}
async function assertVariantInOrg(id: string, orgId: string) {
  const v = await prisma.thumbnailVariant.findFirst({ where: { id, episode: { season: { series: { project: { organizationId: orgId } } } } } });
  if (!v) throw Object.assign(new Error("variant not found"), { statusCode: 404 });
  return v;
}

export const thumbnailRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/episodes/:id/thumbnails", { preHandler: [app.requireAuth] }, async (req) => {
    await assertEpisodeInOrg(req.params.id, req.organizationId!);
    return prisma.thumbnailVariant.findMany({ where: { episodeId: req.params.id }, orderBy: { createdAt: "asc" } });
  });

  app.post<{ Params: { id: string } }>(
    "/episodes/:id/thumbnails",
    { preHandler: [app.requirePermission("publish_episode")] },
    async (req, reply) => {
      await assertEpisodeInOrg(req.params.id, req.organizationId!);
      const body = VariantCreate.parse(req.body);
      const v = await prisma.thumbnailVariant.create({ data: { ...body, episodeId: req.params.id } });
      reply.code(201);
      return v;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/thumbnails/:id/activate",
    { preHandler: [app.requirePermission("publish_episode")] },
    async (req) => {
      const v = await assertVariantInOrg(req.params.id, req.organizationId!);
      await prisma.thumbnailVariant.updateMany({ where: { episodeId: v.episodeId }, data: { isActive: false } });
      return prisma.thumbnailVariant.update({ where: { id: v.id }, data: { isActive: true, activatedAt: new Date() } });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/thumbnails/:id/winner",
    { preHandler: [app.requirePermission("publish_episode")] },
    async (req) => {
      const v = await assertVariantInOrg(req.params.id, req.organizationId!);
      await prisma.thumbnailVariant.updateMany({ where: { episodeId: v.episodeId }, data: { isWinner: false } });
      return prisma.thumbnailVariant.update({ where: { id: v.id }, data: { isWinner: true } });
    },
  );
};
