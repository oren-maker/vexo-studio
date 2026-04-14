"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletAdjustmentSchema = exports.CreateWalletSchema = void 0;
const zod_1 = require("zod");
exports.CreateWalletSchema = zod_1.z.object({
    providerId: zod_1.z.string().cuid(),
    initialCredits: zod_1.z.number().min(0).default(0),
    lowBalanceThreshold: zod_1.z.number().min(0).optional(),
    criticalBalanceThreshold: zod_1.z.number().min(0).optional(),
    isTrackingEnabled: zod_1.z.boolean().default(true),
    notes: zod_1.z.string().optional(),
});
exports.WalletAdjustmentSchema = zod_1.z.object({
    amount: zod_1.z.number().positive(),
    unitType: zod_1.z.enum(["CREDITS", "TOKENS", "USD"]).default("CREDITS"),
    description: zod_1.z.string().optional(),
    referenceId: zod_1.z.string().optional(),
});
//# sourceMappingURL=wallet.js.map