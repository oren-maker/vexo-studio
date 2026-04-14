import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import { prisma } from "@vexo/db";
import { CreateUserSchema, UpdateUserSchema } from "@vexo/shared";

export const userRoutes: FastifyPluginAsync = async (app) => {
  // List users in current org
  app.get("/", { preHandler: [app.requirePermission("manage_users")] }, async (req) =>
    prisma.organizationUser.findMany({
      where: { organizationId: req.organizationId },
      include: {
        user: {
          select: {
            id: true, email: true, username: true, fullName: true,
            isActive: true, lastLoginAt: true, totpEnabled: true,
          },
        },
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  // Create user + add to current org
  app.post("/", { preHandler: [app.requirePermission("manage_users")] }, async (req, reply) => {
    const body = CreateUserSchema.parse(req.body);
    const passwordHash = await argon2.hash(body.password);
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: body.fullName,
          email: body.email,
          username: body.username,
          passwordHash,
          isActive: body.isActive,
        },
      });
      await tx.organizationUser.create({
        data: { organizationId: req.organizationId!, userId: user.id, roleId: body.roleId },
      });
      return user;
    });
    reply.code(201);
    return { id: result.id };
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req, reply) => {
      const m = await prisma.organizationUser.findFirst({
        where: { organizationId: req.organizationId, userId: req.params.id },
        include: { user: true, role: true },
      });
      if (!m) return reply.notFound();
      return m;
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req, reply) => {
      const member = await prisma.organizationUser.findFirst({
        where: { organizationId: req.organizationId, userId: req.params.id },
      });
      if (!member) return reply.notFound();

      const body = UpdateUserSchema.parse(req.body);
      const data: Record<string, unknown> = {
        fullName: body.fullName,
        email: body.email,
        username: body.username,
        isActive: body.isActive,
      };
      if (body.password) data.passwordHash = await argon2.hash(body.password);
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

      const updated = await prisma.user.update({ where: { id: req.params.id }, data });
      if (body.roleId) {
        await prisma.organizationUser.update({
          where: { organizationId_userId: { organizationId: req.organizationId!, userId: req.params.id } },
          data: { roleId: body.roleId },
        });
      }
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req) => {
      // Soft remove from org
      await prisma.organizationUser.deleteMany({
        where: { organizationId: req.organizationId, userId: req.params.id },
      });
      return { ok: true };
    },
  );
};
