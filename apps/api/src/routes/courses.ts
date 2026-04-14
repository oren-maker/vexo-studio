import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { assertProjectInOrg } from "../lib/plan-limits";

const CourseCreate = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  difficultyLevel: z.string().optional(),
  durationMinutes: z.number().int().optional(),
  instructorType: z.string().optional(),
});
const ModuleCreate = z.object({ title: z.string().min(1), orderIndex: z.number().int().min(0), description: z.string().optional() });
const LessonCreate = z.object({ title: z.string().min(1), summary: z.string().optional(), durationSeconds: z.number().int().optional() });

export const courseRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/courses",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      return prisma.course.findMany({ where: { projectId: req.params.projectId }, include: { modules: { include: { lessons: true } } } });
    },
  );

  app.post<{ Params: { projectId: string } }>(
    "/projects/:projectId/courses",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req, reply) => {
      await assertProjectInOrg(req.params.projectId, req.organizationId!);
      const body = CourseCreate.parse(req.body);
      const c = await prisma.course.create({ data: { ...body, projectId: req.params.projectId } });
      reply.code(201);
      return c;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/courses/:id/modules",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req, reply) => {
      const body = ModuleCreate.parse(req.body);
      const m = await prisma.courseModule.create({ data: { ...body, courseId: req.params.id } });
      reply.code(201);
      return m;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/modules/:id/lessons",
    { preHandler: [app.requirePermission("edit_project")] },
    async (req, reply) => {
      const body = LessonCreate.parse(req.body);
      const l = await prisma.lesson.create({ data: { ...body, moduleId: req.params.id } });
      reply.code(201);
      return l;
    },
  );
};
