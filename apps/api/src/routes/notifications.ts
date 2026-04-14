import type { FastifyPluginAsync } from "fastify";
import { prisma } from "@vexo/db";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.requireAuth] }, async (req) =>
    prisma.notificationEvent.findMany({
      where: { userId: req.currentUser!.id, organizationId: req.organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );

  app.patch("/read-all", { preHandler: [app.requireAuth] }, async (req) => {
    await prisma.notificationEvent.updateMany({
      where: { userId: req.currentUser!.id, organizationId: req.organizationId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>(
    "/:id/read",
    { preHandler: [app.requireAuth] },
    async (req) => {
      await prisma.notificationEvent.updateMany({
        where: { id: req.params.id, userId: req.currentUser!.id },
        data: { isRead: true, readAt: new Date() },
      });
      return { ok: true };
    },
  );

  // SSE stream — polls DB every 5s; production should use Redis pub/sub
  app.get("/stream", { preHandler: [app.requireAuth] }, async (req, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(`: connected\n\n`);

    const userId = req.currentUser!.id;
    const orgId = req.organizationId!;
    let lastSeen = new Date();

    const interval = setInterval(async () => {
      try {
        const events = await prisma.notificationEvent.findMany({
          where: { userId, organizationId: orgId, createdAt: { gt: lastSeen } },
          orderBy: { createdAt: "asc" },
        });
        for (const e of events) {
          reply.raw.write(`event: notification\ndata: ${JSON.stringify(e)}\n\n`);
          if (e.createdAt > lastSeen) lastSeen = e.createdAt;
        }
        reply.raw.write(`: ping\n\n`);
      } catch {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 5_000);

    req.raw.on("close", () => clearInterval(interval));
  });
};
