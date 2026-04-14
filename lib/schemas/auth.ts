import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export const TotpVerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/, "TOTP token must be 6 digits"),
});

export const TotpChallengeSchema = z.object({
  challengeId: z.string().min(1),
  token: z.string().regex(/^\d{6}$/),
});

export const TotpDisableSchema = z.object({
  password: z.string().min(8),
  token: z.string().regex(/^\d{6}$/),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type TotpVerifyInput = z.infer<typeof TotpVerifySchema>;
