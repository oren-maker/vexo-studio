import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";

const FrameCreate = z.object({ orderIndex: z.number().int().min(0), beatSummary: z.string().optional(), imagePrompt: z.string().optional(), negativePrompt: z.string().optional() });
const FrameUpdate = FrameCreate.partial().extend({ approvedImageUrl: z.string().url().optional(), status: z.string().optional() });

async function assertFrameInOrg(frameId: string, orgId: string) {
  const f = await prisma.sceneFrame.findFirst({
    where: {
      id: frameId,
      scene: {
        OR: [
          { episode: { season: { series: { project: { organizationId: orgId } } } } },
          { lesson: { module: { course: { project: { organizationId: orgId } } } } },
        ],
      },
    },
  });
  if (!f) throw Object.assign(new Error("frame not found"), { statusCode: 404 });
  return f;
}

export const frameRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { sceneId: string } }>("/scenes/:sceneId/frames", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.sceneFrame.findMany({ where: { sceneId: req.params.sceneId }, orderBy: { orderIndex: "asc" } }),
  );
  app.post<{ Params: { sceneId: string } }>("/scenes/:sceneId/frames", { preHandler: [app.requirePermission("edit_project")] }, async (req, reply) => {
    const body = FrameCreate.parse(req.body);
    const created = await prisma.sceneFrame.create({ data: { ...body, sceneId: req.params.sceneId } });
    reply.code(201);
    return created;
  });
  app.patch<{ Params: { id: string } }>("/frames/:id", { preHandler: [app.requirePermission("edit_project")] }, async (req) => {
    await assertFrameInOrg(req.params.id, req.organizationId!);
    return prisma.sceneFrame.update({ where: { id: req.params.id }, data: FrameUpdate.parse(req.body) });
  });
  app.post<{ Params: { id: string } }>("/frames/:id/regenerate", { preHandler: [app.requirePermission("generate_assets")] }, async (req) => {
    const frame = await assertFrameInOrg(req.params.id, req.organizationId!);
    await prisma.sceneFrame.update({ where: { id: frame.id }, data: { revisionCount: { increment: 1 }, status: "PENDING" } });
    const job = await getQueue(QUEUE_NAMES.STORYBOARD).add("frame-regen", { frameId: frame.id, organizationId: req.organizationId });
    return { jobId: job.id };
  });
};
