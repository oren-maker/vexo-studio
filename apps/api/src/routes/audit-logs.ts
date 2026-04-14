import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";

export const auditLogRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requirePermission("view_logs")] }, async (req) =>
    prisma.auditLog.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: { select: { fullName: true, email: true } } },
    }),
  );
};
