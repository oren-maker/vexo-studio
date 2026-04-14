"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProviderSchema = exports.CreateProviderSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.CreateProviderSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    category: zod_1.z.enum(constants_1.PROVIDER_CATEGORIES),
    apiUrl: zod_1.z.string().url().optional(),
    apiKey: zod_1.z.string().min(4).optional(),
    isActive: zod_1.z.boolean().default(true),
    notes: zod_1.z.string().optional(),
});
exports.UpdateProviderSchema = exports.CreateProviderSchema.partial();
//# sourceMappingURL=provider.js.map