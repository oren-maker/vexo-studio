import { z } from "zod";
export declare const CreateWalletSchema: z.ZodObject<{
    providerId: z.ZodString;
    initialCredits: z.ZodDefault<z.ZodNumber>;
    lowBalanceThreshold: z.ZodOptional<z.ZodNumber>;
    criticalBalanceThreshold: z.ZodOptional<z.ZodNumber>;
    isTrackingEnabled: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    providerId: string;
    initialCredits: number;
    isTrackingEnabled: boolean;
    notes?: string | undefined;
    lowBalanceThreshold?: number | undefined;
    criticalBalanceThreshold?: number | undefined;
}, {
    providerId: string;
    notes?: string | undefined;
    initialCredits?: number | undefined;
    lowBalanceThreshold?: number | undefined;
    criticalBalanceThreshold?: number | undefined;
    isTrackingEnabled?: boolean | undefined;
}>;
export declare const WalletAdjustmentSchema: z.ZodObject<{
    amount: z.ZodNumber;
    unitType: z.ZodDefault<z.ZodEnum<["CREDITS", "TOKENS", "USD"]>>;
    description: z.ZodOptional<z.ZodString>;
    referenceId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    unitType: "CREDITS" | "TOKENS" | "USD";
    description?: string | undefined;
    referenceId?: string | undefined;
}, {
    amount: number;
    unitType?: "CREDITS" | "TOKENS" | "USD" | undefined;
    description?: string | undefined;
    referenceId?: string | undefined;
}>;
export type CreateWalletInput = z.infer<typeof CreateWalletSchema>;
export type WalletAdjustmentInput = z.infer<typeof WalletAdjustmentSchema>;
