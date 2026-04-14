import { z } from "zod";
import { PROVIDER_CATEGORIES } from "../constants";

export const CreateProviderSchema = z.object({
  name: z.string().min(2),
  category: z.enum(PROVIDER_CATEGORIES),
  apiUrl: z.string().url().optional(),
  apiKey: z.string().min(4).optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const UpdateProviderSchema = CreateProviderSchema.partial();
export type CreateProviderInput = z.infer<typeof CreateProviderSchema>;
