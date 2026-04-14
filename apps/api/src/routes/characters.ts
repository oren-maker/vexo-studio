import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { getQueue, QUEUE_NAMES } from "@vexo/queue";
import { assertProjectInOrg } from "../lib/plan-limits";

const CharacterCreate = z.object({
  name: z.string().min(1),
  roleType: z.string().optional(),
  characterType: z.enum(["HUMAN","ANIMATED","NARRATOR"]).optional(),
  gender: z.string().optional(),
  ageRange: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  wardrobeRules: z.string().optional(),
  speechStyle: z.string().optional(),
});
const CharacterUpdate = CharacterCreate.partial().extend({
  continuityLock: z.boolean().optional(),
  personalityPrompt: z.string().optional(),
  behaviorPrompt: z.string().optional(),
});

async function assertCharacterInOrg(charId: string, orgId: string) {
  const c = await prisma.character.findFirst({ where: { id: charId, project: { organizationId: orgId } } });
  if (!c) throw Object.assign(new Error("character not found"), { statusCode: 404 });
  return c;
}

export const characterRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/characters",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return prisma.character.findMany({ where: { projectId: req.params.projectId }, include: { media: true, voices: true } });
    },
  );
  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/characters",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req, reply) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      const body = CharacterCreate.parse(req.body);
      const c = await prisma.character.create({ data: { ...body, projectId: req.params.projectId } });
      reply.code(201);
      return c;
    },
  );
  app.patch<{ Params: { id: string } }>(
    "/characters/:id",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req) => {
      await assertCharacterInOrg(req.params.id, req.organizationId!);
      return prisma.character.update({ where: { id: req.params.id }, data: CharacterUpdate.parse(req.body) });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/characters/:id/generate-gallery",
    { preHandler: [app.requirePermission("generate_assets")] },
    async (req) => {
      const c = await assertCharacterInOrg(req.params.id, req.organizationId!);
      const job = await getQueue(QUEUE_NAMES.AVATAR).add("avatar", { characterId: c.id, organizationId: req.organizationId });
      return { jobId: job.id };
    },
  );
};
