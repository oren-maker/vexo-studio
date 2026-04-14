import type { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";
import { connection, QUEUE_NAMES } from "@vexo/queue";

export const jobRoutes: FastifyPluginAsync = async (app) => {
  // Find a job across all queues by id and stream status updates
  app.get<{ Params: { id: string } }>(
    "/:id/stream",
    { preHandler: [app.requireAuth] },
    async (req, reply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(`: connected\n\n`);

      const queues = Object.values(QUEUE_NAMES).map((n) => new Queue(n, { connection }));
      let lastState = "";

      const interval = setInterval(async () => {
        for (const q of queues) {
          const job = await q.getJob(req.params.id);
          if (!job) continue;
          const state = await job.getState();
          if (state !== lastState) {
            lastState = state;
            reply.raw.write(`event: status\ndata: ${JSON.stringify({ state, progress: job.progress, returnvalue: job.returnvalue })}\n\n`);
          }
          if (state === "completed" || state === "failed") {
            clearInterval(interval);
            reply.raw.end();
            return;
          }
          break;
        }
        reply.raw.write(`: ping\n\n`);
      }, 2_000);

      req.raw.on("close", () => clearInterval(interval));
    },
  );
};
