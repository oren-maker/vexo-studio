import { z } from "zod";

export const CreateUserSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  username: z.string().min(3).max(40),
  password: z.string().min(8),
  roleId: z.string().cuid(),
  isActive: z.boolean().default(true),
});

export const UpdateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(40).optional(),
  password: z.string().min(8).optional(),
  roleId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
