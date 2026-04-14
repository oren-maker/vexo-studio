import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { assertProjectInOrg, assertProjectQuota } from "../lib/plan-limits";
import { auditLog } from "../lib/audit";

const CreateProjectSchema = z.object({
  name: z.string().min(2),
  contentType: z.enum(["SERIES", "COURSE", "KIDS_CONTENT"]),
  description: z.string().optional(),
  language: z.string().default("he"),
  targetAudience: z.string().optional(),
  genreTag: z.string().optional(),
});
const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  thumbnailUrl: z.string().url().optional(),
  defaultDistributionPlatform: z.string().optional(),
  aiDirectorMode: z.enum(["MANUAL", "ASSISTED", "AUTOPILOT"]).optional(),
  autopilotEnabled: z.boolean().optional(),
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.project.findMany({
      where: { organizationId: req.organizationId },
      include: { settings: true, _count: { select: { series: true, courses: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  );

  app.post("/", { preHandler: [app.requirePermission("create_project")] }, async (req, reply) => {
    const body = CreateProjectSchema.parse(req.body);
    await assertProjectQuota(req.organizationId!);
    const project = await prisma.project.create({
      data: { ...body, organizationId: req.organizationId!, createdByUserId: req.currentUser!.id, settings: { create: {} } },
      include: { settings: true },
    });
    await auditLog({ organizationId: req.organizationId!, actorUserId: req.currentUser!.id, entityType: "PROJECT", entityId: project.id, action: "CREATE", newValue: project });
    reply.code(201);
    return project;
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.project.findUnique({
        where: { id: req.params.id },
        include: { settings: true, series: true, courses: true, aiDirector: true },
      });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req) => {
      const old = await assertProjectInOrg(req.params.id, req.organizationId!);
      const body = UpdateProjectSchema.parse(req.body);
      const updated = await prisma.project.update({ where: { id: req.params.id }, data: body });
      await auditLog({ organizationId: req.organizationId!, actorUserId: req.currentUser!.id, entityType: "PROJECT", entityId: updated.id, action: "UPDATE", oldValue: old, newValue: updated });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("delete_project")] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      await prisma.project.update({ where: { id: req.params.id }, data: { status: "ARCHIVED" } });
      return { ok: true };
    },
  );

  // Settings
  app.get<{ Params: { id: string } }>(
    "/:id/settings",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.projectSettings.findUnique({ where: { projectId: req.params.id } });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id/settings",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.projectSettings.update({ where: { projectId: req.params.id }, data: req.body as object });
    },
  );

  // Style guide
  app.get<{ Params: { id: string } }>(
    "/:id/style-guide",
    { preHandler: [app.requireAuth] },
    async (req) => {
      const p = await assertProjectInOrg(req.params.id, req.organizationId!);
      return { styleGuide: p.styleGuide ?? {} };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id/style-guide",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.project.update({ where: { id: req.params.id }, data: { styleGuide: req.body as any } });
    },
  );
};
