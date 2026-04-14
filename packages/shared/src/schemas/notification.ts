import { z } from "zod";
import { NOTIFICATION_TYPES } from "../constants";

export const CreateNotificationSchema = z.object({
  userId: z.string().cuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().min(1),
  body: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
