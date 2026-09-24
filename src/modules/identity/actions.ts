"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";
import { getCurrentSessionId } from "@/platform/tenant/request-context";

import { IDENTITY_PERMISSIONS } from "./permissions";
import {
  createMemberSchema,
  createRoleSchema,
  memberIdSchema,
  profileSchema,
  requestAvatarUploadSchema,
  rolePermissionsSchema,
  updateMemberSchema,
  updateRoleSchema,
} from "./schemas";
import * as members from "./server/members";
import * as profile from "./server/profile";
import * as roles from "./server/roles";
import * as sessions from "./server/sessions";

// --- Users (M02-10 → M02-13) -----------------------------------------------------------------------------

export const createMemberAction = tenantAction
  .metadata({ name: "identity.createMember", permission: IDENTITY_PERMISSIONS.usersManage })
  .inputSchema(createMemberSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await members.createMember(ctx.service, parsedInput);
    revalidatePath("/settings/users");
    return result;
  });

export const updateMemberAction = tenantAction
  .metadata({ name: "identity.updateMember", permission: IDENTITY_PERMISSIONS.usersManage })
  .inputSchema(updateMemberSchema.extend({ membershipId: z.uuid() }))
  .action(async ({ parsedInput: { membershipId, ...values }, ctx }) => {
    const member = await members.updateMember(ctx.service, membershipId, values);
    revalidatePath("/settings/users", "layout");
    return member;
  });

export const deactivateMemberAction = tenantAction
  .metadata({ name: "identity.deactivateMember", permission: IDENTITY_PERMISSIONS.usersManage })
  .inputSchema(memberIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await members.deactivateMember(ctx.service, parsedInput.membershipId);
    revalidatePath("/settings/users", "layout");
  });

export const reactivateMemberAction = tenantAction
  .metadata({ name: "identity.reactivateMember", permission: IDENTITY_PERMISSIONS.usersManage })
  .inputSchema(memberIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await members.reactivateMember(ctx.service, parsedInput.membershipId);
    revalidatePath("/settings/users", "layout");
    return result;
  });

export const sendPasswordResetAction = tenantAction
  .metadata({ name: "identity.sendPasswordReset", permission: IDENTITY_PERMISSIONS.usersManage })
  .inputSchema(memberIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await members.sendMemberPasswordReset(ctx.service, parsedInput.membershipId);
  });

export const resendInvitationAction = tenantAction
  .metadata({ name: "identity.resendInvitation", permission: IDENTITY_PERMISSIONS.usersManage })
  .inputSchema(memberIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await members.resendInvitation(ctx.service, parsedInput.membershipId);
  });

// --- Roles (M02-09) ---------------------------------------------------------------------------------------

export const createRoleAction = tenantAction
  .metadata({ name: "identity.createRole", permission: IDENTITY_PERMISSIONS.rolesManage })
  .inputSchema(createRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const role = await roles.createRole(ctx.service, parsedInput);
    revalidatePath("/settings/roles");
    return { id: role.id };
  });

export const updateRoleAction = tenantAction
  .metadata({ name: "identity.updateRole", permission: IDENTITY_PERMISSIONS.rolesManage })
  .inputSchema(updateRoleSchema.extend({ roleId: z.uuid() }))
  .action(async ({ parsedInput: { roleId, ...values }, ctx }) => {
    await roles.updateRole(ctx.service, roleId, values);
    revalidatePath("/settings/roles", "layout");
  });

export const setRolePermissionsAction = tenantAction
  .metadata({ name: "identity.setRolePermissions", permission: IDENTITY_PERMISSIONS.rolesManage })
  .inputSchema(rolePermissionsSchema.extend({ roleId: z.uuid() }))
  .action(async ({ parsedInput: { roleId, grants }, ctx }) => {
    const result = await roles.setRolePermissions(ctx.service, roleId, { grants });
    revalidatePath("/", "layout");
    return result;
  });

export const deleteRoleAction = tenantAction
  .metadata({ name: "identity.deleteRole", permission: IDENTITY_PERMISSIONS.rolesManage })
  .inputSchema(z.object({ roleId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await roles.deleteRole(ctx.service, parsedInput.roleId);
    revalidatePath("/settings/roles");
  });

// --- Own profile (M02-15, M02-16) ---------------------------------------------------------------------------

export const updateProfileAction = tenantAction
  .metadata({ name: "identity.updateProfile" })
  .inputSchema(profileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await profile.updateMyProfile(ctx.service, parsedInput);
    revalidatePath("/", "layout");
    return result;
  });

export const requestAvatarUploadAction = tenantAction
  .metadata({ name: "identity.requestAvatarUpload" })
  .inputSchema(requestAvatarUploadSchema)
  .action(async ({ parsedInput, ctx }) => profile.requestAvatarUpload(ctx.service, parsedInput));

export const completeAvatarUploadAction = tenantAction
  .metadata({ name: "identity.completeAvatarUpload" })
  .inputSchema(z.object({ fileId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await profile.completeAvatarUpload(ctx.service, parsedInput.fileId);
    revalidatePath("/", "layout");
  });

export const removeAvatarAction = tenantAction
  .metadata({ name: "identity.removeAvatar" })
  .action(async ({ ctx }) => {
    await profile.removeAvatar(ctx.service);
    revalidatePath("/", "layout");
  });

// --- Own sessions (M02-16) -----------------------------------------------------------------------------------

export const revokeSessionAction = tenantAction
  .metadata({ name: "identity.revokeSession" })
  .inputSchema(z.object({ sessionId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await sessions.revokeMySession(ctx.service, parsedInput.sessionId, await getCurrentSessionId());
    revalidatePath("/profile");
  });

export const revokeOtherSessionsAction = tenantAction
  .metadata({ name: "identity.revokeOtherSessions" })
  .action(async ({ ctx }) => {
    const ended = await sessions.revokeMyOtherSessions(ctx.service, await getCurrentSessionId());
    revalidatePath("/profile");
    return { ended };
  });
