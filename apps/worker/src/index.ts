import { Worker, type Processor } from "bullmq";
import pino from "pino";
import { connection, QUEUE_NAMES } from "@vexo/queue";
import { prisma } from "@vexo/db";

const log = pino({ name: "vexo-worker" });

(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () { return this.toString(); };

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
    return { ok: true, sceneId };
  },
  [QUEUE_NAMES.VIDEO]: async (job) => {
    const { sceneId } = job.data as { sceneId: string };
    await prisma.scene.update({ where: { id: sceneId }, data: { status: "VIDEO_REVIEW" } });
    return { ok: true, sceneId };
  },
  [QUEUE_NAMES.MUSIC]: async (job) => {
    const { sceneId, episodeId } = job.data as { sceneId?: string; episodeId?: string };
    return { ok: true, target: sceneId ?? episodeId };
  },
  [QUEUE_NAMES.SUBTITLE]: async (job) => {
    const { episodeId } = job.data as { episodeId: string };
    return { ok: true, episodeId };
  },
  [QUEUE_NAMES.DUBBING]: async (job) => {
    const { episodeId } = job.data as { episodeId: string };
    return { ok: true, episodeId };
  },
  [QUEUE_NAMES.LIPSYNC]: async (job) => {
    const { sceneId } = job.data as { sceneId: string };
    return { ok: true, sceneId };
  },
  [QUEUE_NAMES.AVATAR]: async (job) => {
    const { characterId } = job.data as { characterId: string };
    return { ok: true, characterId };
  },
  [QUEUE_NAMES.DIALOGUE]: async (job) => {
    const { sceneId } = job.data as { sceneId: string };
    return { ok: true, sceneId };
  },
  [QUEUE_NAMES.CRITIC]: async (job) => {
    const { entityId, entityType } = job.data as { entityId: string; entityType: string };
    return { ok: true, entityId, entityType };
  },
  [QUEUE_NAMES.SEO]: async (job) => {
    const { episodeId } = job.data as { episodeId: string };
    return { ok: true, episodeId };
  },
  [QUEUE_NAMES.STYLE_SNAPSHOT]: async (job) => {
    const { projectId } = job.data as { projectId: string };
    return { ok: true, projectId };
  },
  [QUEUE_NAMES.SCRIPT_BREAKDOWN]: async (job) => {
    const { sceneId } = job.data as { sceneId: string };
    return { ok: true, sceneId };
  },
  [QUEUE_NAMES.PUBLISHING]: async (job) => {
    const { episodeId } = job.data as { episodeId: string };
    await prisma.episode.update({ where: { id: episodeId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    return { ok: true, episodeId };
  },
  [QUEUE_NAMES.ANALYTICS]: async (job) => {
    return { ok: true, processed: job.data };
  },
  [QUEUE_NAMES.AUDIENCE_INSIGHTS]: async (job) => {
    return { ok: true, processed: job.data };
  },
  [QUEUE_NAMES.MEMORY]: async (job) => {
    return { ok: true, processed: job.data };
  },
  [QUEUE_NAMES.RECAP]: async (job) => {
    return { ok: true, processed: job.data };
  },
  [QUEUE_NAMES.WEBHOOK_DELIVERY]: async (job) => {
    return { ok: true, delivered: job.data };
  },
  [QUEUE_NAMES.INCOMING_WEBHOOK]: async (job) => {
    return { ok: true, processed: job.data };
  },
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
