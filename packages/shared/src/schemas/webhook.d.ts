import { z } from "zod";
export declare const CreateWebhookSchema: z.ZodObject<{
    url: z.ZodString;
    events: z.ZodArray<z.ZodEnum<["episode.published", "episode.failed", "job.completed", "job.failed", "scene.approved", "budget.warning"]>, "many">;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    isActive: boolean;
    url: string;
    events: ("episode.published" | "episode.failed" | "job.completed" | "job.failed" | "scene.approved" | "budget.warning")[];
}, {
    url: string;
    events: ("episode.published" | "episode.failed" | "job.completed" | "job.failed" | "scene.approved" | "budget.warning")[];
    isActive?: boolean | undefined;
}>;
export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
