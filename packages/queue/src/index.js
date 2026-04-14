"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_PRIORITY = exports.QUEUE_NAMES = exports.defaultJobOptions = exports.connection = void 0;
exports.getQueue = getQueue;
exports.getQueueEvents = getQueueEvents;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const shared_1 = require("@vexo/shared");
Object.defineProperty(exports, "QUEUE_NAMES", { enumerable: true, get: function () { return shared_1.QUEUE_NAMES; } });
Object.defineProperty(exports, "QUEUE_PRIORITY", { enumerable: true, get: function () { return shared_1.QUEUE_PRIORITY; } });
exports.connection = new ioredis_1.default(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});
exports.defaultJobOptions = {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 3_600, count: 1_000 },
    removeOnFail: { age: 24 * 3_600 },
};
const registry = new Map();
function getQueue(name) {
    let q = registry.get(name);
    if (!q) {
        q = new bullmq_1.Queue(name, {
            connection: exports.connection,
            defaultJobOptions: { ...exports.defaultJobOptions, priority: shared_1.QUEUE_PRIORITY[name] ?? 5 },
        });
        registry.set(name, q);
    }
    return q;
}
function getQueueEvents(name) {
    return new bullmq_1.QueueEvents(name, { connection: exports.connection });
}
//# sourceMappingURL=index.js.map