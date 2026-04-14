import { z } from "zod";
export declare const CreateProviderSchema: z.ZodObject<{
    name: z.ZodString;
    category: z.ZodEnum<["VIDEO", "IMAGE", "AUDIO", "DUBBING", "MUSIC", "SUBTITLE", "DISTRIBUTION"]>;
    apiUrl: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    isActive: boolean;
    name: string;
    category: "VIDEO" | "IMAGE" | "AUDIO" | "DUBBING" | "MUSIC" | "SUBTITLE" | "DISTRIBUTION";
    apiUrl?: string | undefined;
    apiKey?: string | undefined;
    notes?: string | undefined;
}, {
    name: string;
    category: "VIDEO" | "IMAGE" | "AUDIO" | "DUBBING" | "MUSIC" | "SUBTITLE" | "DISTRIBUTION";
    isActive?: boolean | undefined;
    apiUrl?: string | undefined;
    apiKey?: string | undefined;
    notes?: string | undefined;
}>;
export declare const UpdateProviderSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<["VIDEO", "IMAGE", "AUDIO", "DUBBING", "MUSIC", "SUBTITLE", "DISTRIBUTION"]>>;
    apiUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    apiKey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    isActive?: boolean | undefined;
    name?: string | undefined;
    category?: "VIDEO" | "IMAGE" | "AUDIO" | "DUBBING" | "MUSIC" | "SUBTITLE" | "DISTRIBUTION" | undefined;
    apiUrl?: string | undefined;
    apiKey?: string | undefined;
    notes?: string | undefined;
}, {
    isActive?: boolean | undefined;
    name?: string | undefined;
    category?: "VIDEO" | "IMAGE" | "AUDIO" | "DUBBING" | "MUSIC" | "SUBTITLE" | "DISTRIBUTION" | undefined;
    apiUrl?: string | undefined;
    apiKey?: string | undefined;
    notes?: string | undefined;
}>;
export type CreateProviderInput = z.infer<typeof CreateProviderSchema>;
