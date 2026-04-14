import { z } from "zod";

export const ApiKeyScopeSchema = z.enum([
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

export const CreateApiKeySchema = z.object({
  name: z.string().min(2).max(80),
  scopes: z.array(ApiKeyScopeSchema).min(1),
  expiresAt: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
