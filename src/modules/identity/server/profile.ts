import { recordAudit } from "@/platform/audit";
import { NotFoundError, ValidationError } from "@/platform/errors";
import {
  completeUpload,
  getFileDownloadUrl,
  requestUpload,
  softDeleteFile,
} from "@/platform/storage/files";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { AVATAR_PURPOSE, type ProfileInput, profileSchema } from "../schemas";

function requireMembership(ctx: ServiceContext): string {
  if (!ctx.actor.membershipId || !ctx.actor.id) throw new NotFoundError("Profile");
  return ctx.actor.membershipId;
}

/** The signed-in user's own profile (M02-15). No permission needed beyond being signed in. */
export async function getMyProfile(ctx: ServiceContext) {
  const membershipId = requireMembership(ctx);
  const member = await ctx.db.membership.findFirst({
    where: { id: membershipId },
    select: {
      id: true,
      employeeCode: true,
      designation: true,
      joinedAt: true,
      avatarFileId: true,
      user: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
      role: { select: { name: true } },
      reportsTo: { select: { user: { select: { name: true } } } },
      _count: { select: { directReports: true } },
    },
  });
  if (!member) throw new NotFoundError("Profile");
  const avatarUrl = member.avatarFileId
    ? await getFileDownloadUrl(ctx, member.avatarFileId, {
        disposition: "inline",
        expiresInSeconds: 3600,
      }).catch(() => null)
    : null;
  return {
    membershipId: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    phone: member.user.phone,
    roleName: member.role.name,
    designation: member.designation,
    employeeCode: member.employeeCode,
    reportsToName: member.reportsTo?.user.name ?? null,
    directReports: member._count.directReports,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null,
    avatarUrl,
  };
}

/** Avatar URL of the signed-in member for the app shell (null when none). */
export async function getMyAvatarUrl(ctx: ServiceContext): Promise<string | null> {
  if (!ctx.actor.membershipId) return null;
  const member = await ctx.db.membership.findFirst({
    where: { id: ctx.actor.membershipId },
    select: { avatarFileId: true },
  });
  if (!member?.avatarFileId) return null;
  return getFileDownloadUrl(ctx, member.avatarFileId, {
    disposition: "inline",
    expiresInSeconds: 3600,
  }).catch(() => null);
}

export async function updateMyProfile(ctx: ServiceContext, input: ProfileInput) {
  requireMembership(ctx);
  const values = parseInput(profileSchema, input);
  return ctx.db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: ctx.actor.id! },
      select: { name: true, phone: true },
    });
    if (!before) throw new NotFoundError("Profile");
    const after = await tx.user.update({
      where: { id: ctx.actor.id! },
      data: { name: values.name, phone: values.phone ?? null },
      select: { name: true, phone: true },
    });
    await recordAudit(tx, ctx, {
      action: "profile.update",
      entityType: "User",
      entityId: ctx.actor.id,
      summary: "Updated their profile",
      before,
      after,
    });
    return after;
  });
}

export async function requestAvatarUpload(
  ctx: ServiceContext,
  input: { fileName: string; contentType: string; size: number },
) {
  requireMembership(ctx);
  return requestUpload(ctx, { purpose: AVATAR_PURPOSE, ...input });
}

export async function completeAvatarUpload(ctx: ServiceContext, fileId: string) {
  const membershipId = requireMembership(ctx);
  const file = await completeUpload(ctx, fileId);
  if (file.purpose !== AVATAR_PURPOSE)
    throw new ValidationError("This file is not a profile photo upload.");
  const previous = await ctx.db.$transaction(async (tx) => {
    const member = await tx.membership.findFirstOrThrow({
      where: { id: membershipId },
      select: { avatarFileId: true },
    });
    await tx.membership.update({ where: { id: membershipId }, data: { avatarFileId: file.id } });
    await recordAudit(tx, ctx, {
      action: "profile.avatar_update",
      entityType: "User",
      entityId: ctx.actor.id,
      summary: "Changed their profile photo",
    });
    return member.avatarFileId;
  });
  if (previous && previous !== file.id) await softDeleteFile(ctx, previous);
}

export async function removeAvatar(ctx: ServiceContext) {
  const membershipId = requireMembership(ctx);
  const previous = await ctx.db.$transaction(async (tx) => {
    const member = await tx.membership.findFirstOrThrow({
      where: { id: membershipId },
      select: { avatarFileId: true },
    });
    if (!member.avatarFileId) return null;
    await tx.membership.update({ where: { id: membershipId }, data: { avatarFileId: null } });
    await recordAudit(tx, ctx, {
      action: "profile.avatar_remove",
      entityType: "User",
      entityId: ctx.actor.id,
      summary: "Removed their profile photo",
    });
    return member.avatarFileId;
  });
  if (previous) await softDeleteFile(ctx, previous);
}
