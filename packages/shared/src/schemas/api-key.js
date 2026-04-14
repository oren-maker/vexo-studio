"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateApiKeySchema = exports.ApiKeyScopeSchema = void 0;
const zod_1 = require("zod");
exports.ApiKeyScopeSchema = zod_1.z.enum([
    "projects:read",
    "projects:write",
    "episodes:read",
    "episodes:write",
    "scenes:read",
    "scenes:write",
    "generate:assets",
    "publish:episodes",
    "analytics:read",
]);
exports.CreateApiKeySchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(80),
    scopes: zod_1.z.array(exports.ApiKeyScopeSchema).min(1),
    expiresAt: zod_1.z.string().datetime().optional(),
});
//# sourceMappingURL=api-key.js.map