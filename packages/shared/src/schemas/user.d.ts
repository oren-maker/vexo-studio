import { z } from "zod";
export declare const CreateUserSchema: z.ZodObject<{
    fullName: z.ZodString;
    email: z.ZodString;
    username: z.ZodString;
    password: z.ZodString;
    roleId: z.ZodString;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    fullName: string;
    username: string;
    roleId: string;
    isActive: boolean;
}, {
    email: string;
    password: string;
    fullName: string;
    username: string;
    roleId: string;
    isActive?: boolean | undefined;
}>;
export declare const UpdateUserSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    roleId: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    password?: string | undefined;
    fullName?: string | undefined;
    username?: string | undefined;
    roleId?: string | undefined;
    isActive?: boolean | undefined;
}, {
    email?: string | undefined;
    password?: string | undefined;
    fullName?: string | undefined;
    username?: string | undefined;
    roleId?: string | undefined;
    isActive?: boolean | undefined;
}>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
