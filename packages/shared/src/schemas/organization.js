"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InviteMemberSchema = exports.UpdateOrganizationSchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.UpdateOrganizationSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    customDomain: zod_1.z.string().optional(),
    logoUrl: zod_1.z.string().url().optional(),
    primaryColor: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    plan: zod_1.z.enum(constants_1.ORG_PLANS).optional(),
});
exports.InviteMemberSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    roleId: zod_1.z.string().cuid(),
});
//# sourceMappingURL=organization.js.map