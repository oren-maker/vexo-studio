import { z } from "zod";
export declare const ApiKeyScopeSchema: z.ZodEnum<["projects:read", "projects:write", "episodes:read", "episodes:write", "scenes:read", "scenes:write", "generate:assets", "publish:episodes", "analytics:read"]>;
export declare const CreateApiKeySchema: z.ZodObject<{
    name: z.ZodString;
    scopes: z.ZodArray<z.ZodEnum<["projects:read", "projects:write", "episodes:read", "episodes:write", "scenes:read", "scenes:write", "generate:assets", "publish:episodes", "analytics:read"]>, "many">;
    expiresAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    scopes: ("projects:read" | "projects:write" | "episodes:read" | "episodes:write" | "scenes:read" | "scenes:write" | "generate:assets" | "publish:episodes" | "analytics:read")[];
    expiresAt?: string | undefined;
}, {
    name: string;
    scopes: ("projects:read" | "projects:write" | "episodes:read" | "episodes:write" | "scenes:read" | "scenes:write" | "generate:assets" | "publish:episodes" | "analytics:read")[];
    expiresAt?: string | undefined;
}>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
