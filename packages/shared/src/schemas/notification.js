"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateNotificationSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.CreateNotificationSchema = zod_1.z.object({
    userId: zod_1.z.string().cuid(),
    type: zod_1.z.enum(constants_1.NOTIFICATION_TYPES),
    title: zod_1.z.string().min(1),
    body: zod_1.z.string().min(1),
    entityType: zod_1.z.string().optional(),
    entityId: zod_1.z.string().optional(),
});
//# sourceMappingURL=notification.js.map