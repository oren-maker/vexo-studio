"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TotpDisableSchema = exports.TotpChallengeSchema = exports.TotpVerifySchema = exports.ResetPasswordSchema = exports.ForgotPasswordSchema = exports.RefreshSchema = exports.LoginSchema = void 0;
const zod_1 = require("zod");
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
exports.RefreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
exports.ForgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.ResetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(10),
    password: zod_1.z.string().min(8),
});
exports.TotpVerifySchema = zod_1.z.object({
    token: zod_1.z.string().regex(/^\d{6}$/, "TOTP token must be 6 digits"),
});
exports.TotpChallengeSchema = zod_1.z.object({
    challengeId: zod_1.z.string().min(1),
    token: zod_1.z.string().regex(/^\d{6}$/),
});
exports.TotpDisableSchema = zod_1.z.object({
    password: zod_1.z.string().min(8),
    token: zod_1.z.string().regex(/^\d{6}$/),
});
//# sourceMappingURL=auth.js.map