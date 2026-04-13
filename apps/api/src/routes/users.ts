import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import { prisma } from "@vexo/db";
import { CreateUserSchema, UpdateUserSchema } from "@vexo/shared";

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requirePermission("manage_users")] }, async () =>
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        isActive: true,
        lastLoginAt: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  app.post("/", { preHandler: [app.requirePermission("manage_users")] }, async (req, reply) => {
    const body = CreateUserSchema.parse(req.body);
    const passwordHash = await argon2.hash(body.password);
    const user = await prisma.user.create({
      data: { ...body, passwordHash, password: undefined as unknown as string },
    });
    reply.code(201);
    return { id: user.id };
  });

  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req, reply) => {
      const u = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true },
      });
      if (!u) return reply.notFound();
      return u;
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req) => {
      const body = UpdateUserSchema.parse(req.body);
      const data: Record<string, unknown> = { ...body };
      if (body.password) {
        data.passwordHash = await argon2.hash(body.password);
        delete data.password;
      }
      return prisma.user.update({ where: { id: req.params.id }, data });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [app.requirePermission("manage_users")] },
    async (req) => {
      await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
      return { ok: true };
    },
  );
};
