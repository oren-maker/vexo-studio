"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserSchema = exports.CreateUserSchema = void 0;
const zod_1 = require("zod");
exports.CreateUserSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    username: zod_1.z.string().min(3).max(40),
    password: zod_1.z.string().min(8),
    roleId: zod_1.z.string().cuid(),
    isActive: zod_1.z.boolean().default(true),
});
exports.UpdateUserSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).optional(),
    email: zod_1.z.string().email().optional(),
    username: zod_1.z.string().min(3).max(40).optional(),
    password: zod_1.z.string().min(8).optional(),
    roleId: zod_1.z.string().cuid().optional(),
    isActive: zod_1.z.boolean().optional(),
});
//# sourceMappingURL=user.js.map