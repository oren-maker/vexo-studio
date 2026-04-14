import { z } from "zod";
import { WEBHOOK_EVENTS } from "../constants";

export const CreateWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  isActive: z.boolean().default(true),
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
