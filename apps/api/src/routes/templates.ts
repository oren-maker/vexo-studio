import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { assertProjectQuota } from "../lib/plan-limits";

const TemplateCreate = z.object({
  name: z.string().min(2),
  contentType: z.enum(["SERIES","COURSE","KIDS_CONTENT"]),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  episodeStructure: z.any().optional(),
  characterPresets: z.any().optional(),
  isPublic: z.boolean().default(false),
  isPremium: z.boolean().default(false),
  price: z.number().min(0).optional(),
});

const ApplyTemplate = z.object({
  projectName: z.string().min(2),
});

export const templateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.projectTemplate.findMany({
      where: { OR: [{ organizationId: req.organizationId }, { isPublic: true }] },
      orderBy: { usageCount: "desc" },
    }),
  );

  app.post("/", { preHandler: [app.requirePermission("manage_templates")] }, async (req, reply) => {
    const body = TemplateCreate.parse(req.body);
    const t = await prisma.projectTemplate.create({
      data: { ...body, organizationId: req.organizationId, createdByUserId: req.currentUser!.id },
    });
    reply.code(201);
    return t;
  });

  app.get<{ Params: { id: string } }>("/:id", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.projectTemplate.findUnique({ where: { id: req.params.id } }),
  );

  app.patch<{ Params: { id: string } }>("/:id", { preHandler: [app.requirePermission("manage_templates")] }, async (req) => {
    const updates = TemplateCreate.partial().parse(req.body);
    return prisma.projectTemplate.update({ where: { id: req.params.id }, data: updates });
  });

  app.delete<{ Params: { id: string } }>("/:id", { preHandler: [app.requirePermission("manage_templates")] }, async (req) => {
    await prisma.projectTemplate.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/:id/apply", { preHandler: [app.requirePermission("create_project")] }, async (req, reply) => {
    await assertProjectQuota(req.organizationId!);
    const t = await prisma.projectTemplate.findUniqueOrThrow({ where: { id: req.params.id } });
    const body = ApplyTemplate.parse(req.body);
    const project = await prisma.project.create({
      data: {
        organizationId: req.organizationId!,
        createdByUserId: req.currentUser!.id,
        name: body.projectName,
        contentType: t.contentType,
        description: t.description ?? undefined,
        settings: { create: {} },
      },
    });
    await prisma.projectTemplate.update({ where: { id: t.id }, data: { usageCount: { increment: 1 } } });
    reply.code(201);
    return project;
  });
};
