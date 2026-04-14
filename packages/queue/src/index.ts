import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES, QUEUE_PRIORITY } from "@vexo/shared";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 24 * 3_600 },
};

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const registry = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = registry.get(name);
  if (!q) {
    q = new Queue(name, {
      connection,
      defaultJobOptions: { ...defaultJobOptions, priority: QUEUE_PRIORITY[name] ?? 5 },
    });
    registry.set(name, q);
  }
  return q;
}

export function getQueueEvents(name: QueueName): QueueEvents {
  return new QueueEvents(name, { connection });
}

export interface BaseJob {
  jobId: string;
  jobType: string;
  entityType: string;
  entityId: string;
  organizationId: string;
  providerId?: string;
  payload: Record<string, unknown>;
  priority?: number;
  estimatedCost?: number;
  actualCost?: number;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  startedAt?: Date;
  completedAt?: Date;
  failedReason?: string;
}

export { QUEUE_NAMES, QUEUE_PRIORITY };
