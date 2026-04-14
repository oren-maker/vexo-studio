import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { SEO } from "../services";

const SeoUpdate = z.object({ seoTitle: z.string().optional(), seoDescription: z.string().optional(), seoTags: z.array(z.string()).optional() });

async function assertEpisodeInOrg(id: string, orgId: string) {
  const e = await prisma.episode.findFirst({ where: { id, season: { series: { project: { organizationId: orgId } } } } });
  if (!e) throw Object.assign(new Error("episode not found"), { statusCode: 404 });
  return e;
}

export const seoRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>(
    "/episodes/:id/seo/generate",
    { preHandler: [app.requirePermission("publish_episode")] },
    async (req) => {
      const ep = await assertEpisodeInOrg(req.params.id, req.organizationId!);
      const seo = await SEO.generateEpisodeSEO(ep.id);
      return prisma.episode.update({
        where: { id: ep.id },
        data: { seoTitle: seo.title, seoDescription: seo.description, seoTags: seo.tags as any },
      });
    },
  );

  app.get<{ Params: { id: string } }>("/episodes/:id/seo", { preHandler: [app.requireAuth] }, async (req) => {
    const ep = await assertEpisodeInOrg(req.params.id, req.organizationId!);
    return { seoTitle: ep.seoTitle, seoDescription: ep.seoDescription, seoTags: ep.seoTags };
  });

  app.patch<{ Params: { id: string } }>("/episodes/:id/seo", { preHandler: [app.requirePermission("publish_episode")] }, async (req) => {
    const ep = await assertEpisodeInOrg(req.params.id, req.organizationId!);
    const body = SeoUpdate.parse(req.body);
    return prisma.episode.update({ where: { id: ep.id }, data: { ...body, seoTags: body.seoTags as any } });
  });
};
