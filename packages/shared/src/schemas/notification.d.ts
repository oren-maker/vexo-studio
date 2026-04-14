import { z } from "zod";
export declare const CreateNotificationSchema: z.ZodObject<{
    userId: z.ZodString;
    type: z.ZodEnum<["JOB_DONE", "JOB_FAILED", "EPISODE_READY", "BUDGET_WARNING", "PUBLISH_SUCCESS"]>;
    title: z.ZodString;
    body: z.ZodString;
    entityType: z.ZodOptional<z.ZodString>;
    entityId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "JOB_DONE" | "JOB_FAILED" | "EPISODE_READY" | "BUDGET_WARNING" | "PUBLISH_SUCCESS";
    userId: string;
    title: string;
    body: string;
    entityType?: string | undefined;
    entityId?: string | undefined;
}, {
    type: "JOB_DONE" | "JOB_FAILED" | "EPISODE_READY" | "BUDGET_WARNING" | "PUBLISH_SUCCESS";
    userId: string;
    title: string;
    body: string;
    entityType?: string | undefined;
    entityId?: string | undefined;
}>;
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
