import { Worker, type Processor } from "bullmq";
import pino from "pino";
import { connection, QUEUE_NAMES } from "@vexo/queue";
import { prisma } from "@vexo/db";

const log = pino({ name: "vexo-worker" });

async function notify(orgId: string, userId: string | undefined, type: string, title: string, body: string, entity?: { type: string; id: string }) {
  if (!userId) return;
  await prisma.notificationEvent.create({
    data: { organizationId: orgId, userId, type, title, body, entityType: entity?.type, entityId: entity?.id },
  });
}

const handlers: Record<string, Processor> = {
  [QUEUE_NAMES.STORYBOARD]: async (job) => {
    const { sceneId } = job.data as { sceneId: string };
    await prisma.scene.update({ where: { id: sceneId }, data: { status: "STORYBOARD_REVIEW" } });
    return { ok: true };
  },
  [QUEUE_NAMES.VIDEO]: async (job) => {
    const { sceneId } = job.data as { sceneId: string };
    await prisma.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW" } });
    return { ok: true };
  },
  [QUEUE_NAMES.PUBLISHING]: async (job) => {
    const { episodeId } = job.data as { episodeId: string };
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    return { ok: true, episodeId };
  },
  [QUEUE_NAMES.WEBHOOK_DELIVERY]: async (job) => ({ ok: true, delivered: job.data }),
  [QUEUE_NAMES.INCOMING_WEBHOOK]: async (job) => ({ ok: true, processed: job.data }),
};

const noopProcessor: Processor = async (job) => {
  log.info({ queue: job.queueName, id: job.id }, "stub processed");
  return { ok: true };
};

for (const name of Object.values(QUEUE_NAMES)) {
  const processor = handlers[name] ?? noopProcessor;
  const w = new Worker(name, processor, { connection, concurrency: 4 });

  w.on("completed", async (job) => {
    log.info({ q: name, id: job.id }, "completed");
    const data = job.data as { organizationId?: string; userId?: string; entityType?: string; entityId?: string };
    if (data?.organizationId && data?.userId) {
      await notify(data.organizationId, data.userId, "JOB_DONE", `${name} completed`, `Job ${job.id} finished.`,
        data.entityType && data.entityId ? { type: data.entityType, id: data.entityId } : undefined);
    }
  });
  w.on("failed", async (job, err) => {
    log.error({ q: name, id: job?.id, err: err.message }, "failed");
    const data = job?.data as { organizationId?: string; userId?: string };
    if (data?.organizationId && data?.userId) {
      await notify(data.organizationId, data.userId, "JOB_FAILED", `${name} failed`, err.message);
    }
  });

  log.info({ queue: name, hasHandler: !!handlers[name] }, "worker started");
}
