import { z } from "zod";
export declare const UpdateOrganizationSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    customDomain: z.ZodOptional<z.ZodString>;
    logoUrl: z.ZodOptional<z.ZodString>;
    primaryColor: z.ZodOptional<z.ZodString>;
    plan: z.ZodOptional<z.ZodEnum<["FREE", "PRO", "STUDIO", "ENTERPRISE"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    customDomain?: string | undefined;
    logoUrl?: string | undefined;
    primaryColor?: string | undefined;
    plan?: "FREE" | "PRO" | "STUDIO" | "ENTERPRISE" | undefined;
}, {
    name?: string | undefined;
    customDomain?: string | undefined;
    logoUrl?: string | undefined;
    primaryColor?: string | undefined;
    plan?: "FREE" | "PRO" | "STUDIO" | "ENTERPRISE" | undefined;
}>;
export declare const InviteMemberSchema: z.ZodObject<{
    email: z.ZodString;
    roleId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    roleId: string;
}, {
    email: string;
    roleId: string;
}>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
