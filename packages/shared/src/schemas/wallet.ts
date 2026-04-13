import { z } from "zod";

export const CreateWalletSchema = z.object({
  providerId: z.string().cuid(),
  initialCredits: z.number().min(0).default(0),
  lowBalanceThreshold: z.number().min(0).optional(),
  criticalBalanceThreshold: z.number().min(0).optional(),
  isTrackingEnabled: z.boolean().default(true),
  notes: z.string().optional(),
});

export const WalletAdjustmentSchema = z.object({
  amount: z.number().positive(),
  unitType: z.enum(["CREDITS", "TOKENS", "USD"]).default("CREDITS"),
  description: z.string().optional(),
  referenceId: z.string().optional(),
});

export type CreateWalletInput = z.infer<typeof CreateWalletSchema>;
export type WalletAdjustmentInput = z.infer<typeof WalletAdjustmentSchema>;
