import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";

export const roleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requireAuth] }, async () =>
    prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    }),
  );

  app.get(
    "/permissions",
    { preHandler: [app.requireAuth] },
    async () => prisma.permission.findMany({ orderBy: { key: "asc" } }),
  );
};
