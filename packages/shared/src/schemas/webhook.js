"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateWebhookSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.CreateWebhookSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    events: zod_1.z.array(zod_1.z.enum(constants_1.WEBHOOK_EVENTS)).min(1),
    isActive: zod_1.z.boolean().default(true),
});
//# sourceMappingURL=webhook.js.map