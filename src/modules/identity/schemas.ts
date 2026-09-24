import { z } from "zod";

import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/platform/auth/password-policy";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const optionalId = z
  .union([z.literal(""), z.uuid()])
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

export const dataScopeSchema = z.enum(["OWN", "TEAM", "ALL"]);

/** Create user (M02-10). */
export const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's full name").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid e-mail address")),
  phone: optionalText(30),
  roleId: z.uuid("Choose a role"),
  reportsToId: optionalId,
  employeeCode: optionalText(40),
  designation: optionalText(80),
});
export type CreateMemberInput = z.input<typeof createMemberSchema>;
export type CreateMemberValues = z.output<typeof createMemberSchema>;

/** Edit user (M02-11). E-mail is the login identity and stays unchanged here. */
export const updateMemberSchema = createMemberSchema.omit({ email: true });
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;
export type UpdateMemberValues = z.output<typeof updateMemberSchema>;

export const memberIdSchema = z.object({ membershipId: z.uuid() });

export const createRoleSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name").max(60),
  description: optionalText(200),
  copyFromRoleId: optionalId,
});
export type CreateRoleInput = z.input<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.pick({ name: true, description: true });
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;

export const rolePermissionsSchema = z.object({
  grants: z
    .array(
      z.object({
        permission: z.string().min(1).max(100),
        scope: dataScopeSchema.nullable().optional(),
      }),
    )
    .max(500),
});
export type RolePermissionsInput = z.input<typeof rolePermissionsSchema>;

/** Own profile (M02-15). */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  phone: optionalText(30),
});
export type ProfileInput = z.input<typeof profileSchema>;

/** Client-side validation for password forms; the server enforces the same policy. */
export const newPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, PASSWORD_HINT)
      .max(128)
      .regex(/[A-Za-z]/, PASSWORD_HINT)
      .regex(/\d/, PASSWORD_HINT),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match",
  });

export const AVATAR_PURPOSE = "member.avatar";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const requestAvatarUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(AVATAR_TYPES),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES, "The photo must be 2 MB or smaller"),
});
