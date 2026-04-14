import { z } from "zod";
import { ORG_PLANS } from "../constants";

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  customDomain: z.string().optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  plan: z.enum(ORG_PLANS).optional(),
});

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  roleId: z.string().cuid(),
});

export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
