import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@vexo/db";
import { assertProjectInOrg } from "../lib/plan-limits";

const EntryCreate = z.object({
  episodeId: z.string().cuid().optional(),
  lessonId: z.string().cuid().optional(),
  title: z.string().min(1),
  scheduledAt: z.string().datetime(),
  platform: z.string().default("YOUTUBE"),
  notes: z.string().optional(),
});
const EntryUpdate = EntryCreate.partial().extend({ status: z.enum(["SCHEDULED","PUBLISHED","CANCELLED"]).optional() });

async function assertEntryInOrg(id: string, orgId: string) {
  const e = await prisma.contentCalendarEntry.findFirst({ where: { id, project: { organizationId: orgId } } });
  if (!e) throw Object.assign(new Error("entry not found"), { statusCode: 404 });
  return e;
}

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    "/projects/:id/calendar",
    { preHandler: [app.requirePermission("manage_calendar")] },
    async (req) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      return prisma.contentCalendarEntry.findMany({
        where: {
          projectId: req.params.id,
          scheduledAt: {
            gte: req.query.from ? new Date(req.query.from) : undefined,
            lte: req.query.to ? new Date(req.query.to) : undefined,
          },
        },
        orderBy: { scheduledAt: "asc" },
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    "/projects/:id/calendar",
    { preHandler: [app.requirePermission("manage_calendar")] },
    async (req, reply) => {
      await assertProjectInOrg(req.params.id, req.organizationId!);
      const body = EntryCreate.parse(req.body);
      const e = await prisma.contentCalendarEntry.create({
        data: { ...body, scheduledAt: new Date(body.scheduledAt), projectId: req.params.id },
      });
      reply.code(201);
      return e;
    },
  );

  app.patch<{ Params: { id: string } }>("/calendar/:id", { preHandler: [app.requirePermission("manage_calendar")] }, async (req) => {
    await assertEntryInOrg(req.params.id, req.organizationId!);
    const body = EntryUpdate.parse(req.body);
    return prisma.contentCalendarEntry.update({
      where: { id: req.params.id },
      data: { ...body, scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined },
    });
  });

  app.delete<{ Params: { id: string } }>("/calendar/:id", { preHandler: [app.requirePermission("manage_calendar")] }, async (req) => {
    await assertEntryInOrg(req.params.id, req.organizationId!);
    await prisma.contentCalendarEntry.update({ where: { id: req.params.id }, data: { status: "CANCELLED" } });
    return { ok: true };
  });
};
