import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES, QUEUE_PRIORITY } from "@vexo/shared";
export declare const connection: IORedis;
export declare const defaultJobOptions: JobsOptions;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export declare function getQueue(name: QueueName): Queue;
export declare function getQueueEvents(name: QueueName): QueueEvents;
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
