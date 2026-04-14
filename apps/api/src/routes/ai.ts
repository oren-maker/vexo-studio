import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { AIDirector, AICritic, Memory, StyleEngine } from "../services";
import { assertProjectInOrg } from "../lib/plan-limits";

const AIDirectorUpdate = z.object({
  mode: z.enum(["MANUAL","ASSISTED","AUTOPILOT"]).optional(),
  learningEnabled: z.boolean().optional(),
  autopilotEnabled: z.boolean().optional(),
});

export const aiRoutes: FastifyPluginAsync = async (app) => {
  // ---- AI Director ----
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/ai-director", { preHandler: [app.requireAuth] }, async (req) => {
    await assertProjectInOrg(req.params.projectId, req.organizationId!);
    return prisma.aIDirector.upsert({
      where: { projectId: req.params.projectId },
      update: {},
      create: { projectId: req.params.projectId },
    });
  });

  app.patch<{ Params: { projectId: string } }>(
    "/projects/:projectId/ai-director",
    { preHandler: [app.requirePermission("manage_ai_director")] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      const body = AIDirectorUpdate.parse(req.body);
      return prisma.aIDirector.upsert({
        where: { projectId: req.params.projectId },
        update: body,
        create: { projectId: req.params.projectId, ...body },
      });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/ai-director/run",
    { preHandler: [app.requirePermission("manage_ai_director")] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return AIDirector.runNextStep(req.params.projectId);
    },
  );

  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/ai-logs",
    { preHandler: [app.requirePermission("view_logs")] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return prisma.aILog.findMany({ where: { projectId: req.params.projectId }, orderBy: { createdAt: "desc" }, take: 200 });
    },
  );

  // ---- AI Critic ----
  app.post<{ Params: { id: string } }>("/episodes/:id/critic/review", { preHandler: [app.requireAuth] }, async (req) => {
    return AICritic.reviewEpisode(req.params.id);
  });

  // ---- Memory ----
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/memory", { preHandler: [app.requireAuth] }, async (req) => {
    await assertProjectInOrg(req.params.projectId, req.organizationId!);
    return prisma.projectMemory.findMany({ where: { projectId: req.params.projectId }, orderBy: { importanceScore: "desc" } });
  });

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/recap/generate",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return { recap: await Memory.generateRecap("") };
    },
  );

  // ---- Style Engine ----
  app.get<{ Params: { id: string } }>(
    "/projects/:id/style-snapshots",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.styleConsistencySnapshot.findMany({ where: { projectId: req.params.id }, orderBy: { createdAt: "desc" }, take: 50 });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/projects/:id/style-snapshots/refresh",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return StyleEngine.analyzeApprovedFrames(req.params.id);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/projects/:id/style-constraints",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return { prompt: await StyleEngine.generateStyleConstraints(req.params.id) };
    },
  );
};
