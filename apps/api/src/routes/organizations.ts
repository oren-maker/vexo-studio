import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";
import { UpdateOrganizationSchema, InviteMemberSchema, PLAN_LIMITS } from "@vexo/shared";

export const organizationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", { preHandler: [app.requireAuth] }, async (req) => {
    const org = await prisma.organization.findUnique({ where: { id: req.organizationId } });
    return org;
  });

  app.patch("/me", { preHandler: [app.requirePermission("manage_organization")] }, async (req) => {
    const body = UpdateOrganizationSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.plan) {
      const limits = PLAN_LIMITS[body.plan];
      data.maxProjects = limits.maxProjects;
      data.maxEpisodes = limits.maxEpisodes;
      data.whitelabelEnabled = limits.whitelabel;
    }
    return prisma.organization.update({ where: { id: req.organizationId! }, data });
  });

  app.get("/me/members", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.organizationUser.findMany({
      where: { organizationId: req.organizationId },
      include: {
        user: { select: { id: true, email: true, fullName: true, totpEnabled: true, lastLoginAt: true } },
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  );

  app.post(
    "/me/invite",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req, reply) => {
      const body = InviteMemberSchema.parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user) return reply.notFound("user not found — invite flow not yet implemented");
      const m = await prisma.organizationUser.upsert({
        where: { organizationId_userId: { organizationId: req.organizationId!, userId: user.id } },
        update: { roleId: body.roleId },
        create: { organizationId: req.organizationId!, userId: user.id, roleId: body.roleId },
      });
      reply.code(201);
      return m;
    },
  );

  app.delete<{ Params: { userId: string } }>(
    "/me/members/:userId",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req) => {
      await prisma.organizationUser.deleteMany({
        where: { organizationId: req.organizationId, userId: req.params.userId },
      });
      return { ok: true };
    },
  );
};
