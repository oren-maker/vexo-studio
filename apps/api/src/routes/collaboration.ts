import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";

const CommentCreate = z.object({ body: z.string().min(1), frameId: z.string().cuid().optional() });
const CommentUpdate = z.object({ body: z.string().min(1).optional(), resolved: z.boolean().optional() });
const TaskCreate = z.object({
  taskType: z.enum(["REVIEW","APPROVE","GENERATE","PUBLISH"]),
  assignedTo: z.string().cuid(),
  dueAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});
const TaskUpdate = z.object({ status: z.enum(["OPEN","IN_PROGRESS","DONE"]).optional(), notes: z.string().optional(), dueAt: z.string().datetime().optional() });

async function assertSceneInOrg(id: string, orgId: string) {
  const s = await prisma.scene.findFirst({
    where: { id, OR: [{ episode: { season: { series: { project: { organizationId: orgId } } } } }, { lesson: { module: { course: { project: { organizationId: orgId } } } } }] },
  });
  if (!s) throw Object.assign(new Error("scene not found"), { statusCode: 404 });
  return s;
}

export const collaborationRoutes: FastifyPluginAsync = async (app) => {
  // ---- Comments ----
  app.get<{ Params: { id: string } }>("/scenes/:id/comments", { preHandler: [app.requireAuth] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return prisma.sceneComment.findMany({
      where: { sceneId: req.params.id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post<{ Params: { id: string } }>("/scenes/:id/comments", { preHandler: [app.requireAuth] }, async (req, reply) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    const body = CommentCreate.parse(req.body);
    const created = await prisma.sceneComment.create({
      data: { ...body, sceneId: req.params.id, userId: req.currentUser!.id },
    });
    reply.code(201);
    return created;
  });

  app.patch<{ Params: { id: string } }>("/comments/:id", { preHandler: [app.requireAuth] }, async (req) => {
    return prisma.sceneComment.update({ where: { id: req.params.id }, data: CommentUpdate.parse(req.body) });
  });

  app.delete<{ Params: { id: string } }>("/comments/:id", { preHandler: [app.requireAuth] }, async (req) => {
    await prisma.sceneComment.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/comments/:id/resolve", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.sceneComment.update({
      where: { id: req.params.id },
      data: { resolved: true, resolvedAt: new Date(), resolvedBy: req.currentUser!.id },
    }),
  );

  // ---- Tasks ----
  app.get<{ Params: { id: string } }>("/scenes/:id/tasks", { preHandler: [app.requireAuth] }, async (req) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    return prisma.taskAssignment.findMany({ where: { sceneId: req.params.id }, orderBy: { createdAt: "desc" } });
  });

  app.post<{ Params: { id: string } }>("/scenes/:id/tasks", { preHandler: [app.requirePermission("edit_project")] }, async (req, reply) => {
    await assertSceneInOrg(req.params.id, req.organizationId!);
    const body = TaskCreate.parse(req.body);
    const t = await prisma.taskAssignment.create({
      data: {
        sceneId: req.params.id,
        assignedBy: req.currentUser!.id,
        assignedTo: body.assignedTo,
        taskType: body.taskType,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        notes: body.notes,
      },
    });
    reply.code(201);
    return t;
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id", { preHandler: [app.requireAuth] }, async (req) => {
    const body = TaskUpdate.parse(req.body);
    return prisma.taskAssignment.update({
      where: { id: req.params.id },
      data: {
        status: body.status,
        notes: body.notes,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        completedAt: body.status === "DONE" ? new Date() : undefined,
      },
    });
  });
};
