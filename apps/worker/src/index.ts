import { Worker, type Processor } from "bullmq";
import pino from "pino";
import { connection, QUEUE_NAMES } from "@vexo/queue";

const log = pino({ name: "vexo-worker" });

const noopProcessor: Processor = async (job) => {
  log.info({ queue: job.queueName, id: job.id, name: job.name }, "received job (stub)");
  return { ok: true, processedAt: new Date().toISOString() };
};

const queues = Object.values(QUEUE_NAMES);
for (const name of queues) {
  const w = new Worker(name, noopProcessor, { connection, concurrency: 4 });
  w.on("completed", (job) => log.info({ q: name, id: job.id }, "completed"));
  w.on("failed", (job, err) => log.error({ q: name, id: job?.id, err: err.message }, "failed"));
  log.info({ queue: name }, "worker started");
}
