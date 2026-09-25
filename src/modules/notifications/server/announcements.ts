import type { Announcement } from "@/generated/prisma/client";
import type { AnnouncementAudience } from "@/generated/prisma/enums";
import { findMembers, listRoleOptions } from "@/modules/identity";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx, TenantTx } from "@/platform/db/tenant-scope";
import { ForbiddenError, NotFoundError, ValidationError } from "@/platform/errors";
import { enqueueJob } from "@/platform/jobs/enqueue";
import type { Logger } from "@/platform/logger";
import { getSubtreeMembershipIds } from "@/platform/rbac/scope";
import { createSystemContext, type ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { NOTIFICATION_JOBS } from "../constants";
import { NOTIFICATION_PERMISSIONS } from "../permissions";
import { type AnnouncementInput, announcementSchema } from "../schemas";
import { notify } from "./notify";

/**
 * Announcements (M06-09): news for everyone, some roles or a manager's team. When one goes live its audience is
 * notified once; it shows as a banner until the person dismisses it or it expires, and reads are tracked.
 */
export type AnnouncementState = "DRAFT" | "SCHEDULED" | "LIVE" | "EXPIRED";

export function announcementState(
  announcement: Pick<Announcement, "publishedAt" | "expiresAt">,
  now: Date,
): AnnouncementState {
  if (!announcement.publishedAt) return "DRAFT";
  if (announcement.expiresAt && announcement.expiresAt <= now) return "EXPIRED";
  if (announcement.publishedAt > now) return "SCHEDULED";
  return "LIVE";
}

type AudienceFields = Pick<Announcement, "audience" | "roleIds" | "teamOfId">;

/** Active members an announcement is for. */
export async function resolveAudience(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
  announcement: AudienceFields,
): Promise<string[]> {
  if (announcement.audience === "TEAM") {
    if (!announcement.teamOfId) return [];
    const tree = await getSubtreeMembershipIds(db, ctx.organizationId, announcement.teamOfId);
    const members = await findMembers(db, { ids: tree, activeOnly: true });
    return members.map((member) => member.membershipId);
  }
  const members = await findMembers(db, {
    activeOnly: true,
    ...(announcement.audience === "ROLES" ? { roleIds: announcement.roleIds } : {}),
  });
  return members.map((member) => member.membershipId);
}

async function isInAudience(
  db: TenantDbOrTx,
  ctx: ServiceContext,
  announcement: AudienceFields,
  member: { membershipId: string; roleId: string },
): Promise<boolean> {
  if (announcement.audience === "ALL") return true;
  if (announcement.audience === "ROLES") return announcement.roleIds.includes(member.roleId);
  if (!announcement.teamOfId) return false;
  const tree = await getSubtreeMembershipIds(db, ctx.organizationId, announcement.teamOfId);
  return tree.includes(member.membershipId);
}

function excerpt(body: string, length = 280): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/**
 * Notifies the audience if the announcement is live and nobody was notified yet. The conditional update makes
 * the job, the sweep and a direct publish safe to race.
 */
async function publishIfDue(
  tx: TenantTx,
  ctx: ServiceContext,
  announcementId: string,
  now: Date,
): Promise<boolean> {
  const [announcement] = await tx.announcement.updateManyAndReturn({
    where: {
      id: announcementId,
      notifiedAt: null,
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { notifiedAt: now },
  });
  if (!announcement) return false;
  const recipientIds = await resolveAudience(tx, ctx, announcement);
  await notify(
    ctx,
    {
      type: "announcement",
      recipientIds,
      title: announcement.title,
      body: announcement.body,
      link: "/announcements",
      entity: { type: "Announcement", id: announcement.id },
      actorName: announcement.createdByName,
      idempotencyKey: `announcement:${announcement.id}`,
    },
    { tx },
  );
  await recordAudit(tx, ctx, {
    action: "notifications.announcement.publish",
    entityType: "Announcement",
    entityId: announcement.id,
    summary: `Announcement "${announcement.title}" went live for ${recipientIds.length} ${
      recipientIds.length === 1 ? "person" : "people"
    }`,
  });
  return true;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  roleIds: string[];
  teamOfId: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  state: AnnouncementState;
  createdByName: string;
  createdAt: string;
  /** People who dismissed or opened it. */
  reads: number;
  /** People it is for now (active members). */
  audienceSize: number;
}

export async function listAnnouncements(ctx: ServiceContext): Promise<AnnouncementRow[]> {
  ctx.permissions.assert(NOTIFICATION_PERMISSIONS.announcementsManage);
  const now = new Date();
  const announcements = await ctx.db.announcement.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { _count: { select: { reads: true } } },
    take: 200,
  });
  return Promise.all(
    announcements.map(async (announcement) => ({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience,
      roleIds: announcement.roleIds,
      teamOfId: announcement.teamOfId,
      publishedAt: announcement.publishedAt?.toISOString() ?? null,
      expiresAt: announcement.expiresAt?.toISOString() ?? null,
      state: announcementState(announcement, now),
      createdByName: announcement.createdByName,
      createdAt: announcement.createdAt.toISOString(),
      reads: announcement._count.reads,
      audienceSize: (await resolveAudience(ctx.db, ctx, announcement)).length,
    })),
  );
}

async function assertAudienceExists(
  db: TenantDbOrTx,
  values: { audience: AnnouncementAudience; roleIds: string[]; teamOfId: string | null },
) {
  if (values.audience === "ROLES") {
    const found = await listRoleOptions(db, { ids: values.roleIds });
    if (found.length !== new Set(values.roleIds).size) {
      throw new ValidationError("Choose existing roles.", { roleIds: ["Unknown role"] });
    }
  }
  if (values.audience === "TEAM" && values.teamOfId) {
    const [manager] = await findMembers(db, { ids: [values.teamOfId], activeOnly: true });
    if (!manager) {
      throw new ValidationError("Choose an active member.", { teamOfId: ["Unknown member"] });
    }
  }
}

/** Creates or edits an announcement; publishing now notifies the audience in the same transaction. */
export async function saveAnnouncement(
  ctx: ServiceContext,
  announcementId: string | null,
  input: AnnouncementInput,
): Promise<{ id: string; state: AnnouncementState }> {
  ctx.permissions.assert(NOTIFICATION_PERMISSIONS.announcementsManage);
  const values = parseInput(announcementSchema, input);
  const data = {
    title: values.title,
    body: values.body,
    audience: values.audience,
    roleIds: values.audience === "ROLES" ? [...new Set(values.roleIds)] : [],
    teamOfId: values.audience === "TEAM" ? values.teamOfId : null,
    publishedAt: values.publishedAt,
    expiresAt: values.expiresAt,
  };
  const now = new Date();
  // "Publish now" is sent with the browser's clock: a slightly fast clock must not turn it into a schedule.
  if (
    data.publishedAt &&
    data.publishedAt > now &&
    data.publishedAt.getTime() - now.getTime() < 60_000
  ) {
    data.publishedAt = now;
  }
  if (data.expiresAt && data.expiresAt <= now) {
    throw new ValidationError("The end must be in the future.", {
      expiresAt: ["Choose a later time"],
    });
  }
  return ctx.db.$transaction(async (tx) => {
    await assertAudienceExists(tx, data);
    let saved: Announcement;
    if (announcementId) {
      const before = await tx.announcement.findFirst({ where: { id: announcementId } });
      if (!before) throw new NotFoundError("Announcement", announcementId);
      saved = await tx.announcement.update({ where: { id: announcementId }, data });
      await recordAudit(tx, ctx, {
        action: "notifications.announcement.update",
        entityType: "Announcement",
        entityId: saved.id,
        summary: `Updated announcement "${saved.title}"`,
        before: {
          title: before.title,
          audience: before.audience,
          publishedAt: before.publishedAt,
          expiresAt: before.expiresAt,
        },
        after: {
          title: saved.title,
          audience: saved.audience,
          publishedAt: saved.publishedAt,
          expiresAt: saved.expiresAt,
        },
      });
    } else {
      saved = await tx.announcement.create({
        data: { organizationId: ctx.organizationId, ...data, createdByName: ctx.actor.name },
      });
      await recordAudit(tx, ctx, {
        action: "notifications.announcement.create",
        entityType: "Announcement",
        entityId: saved.id,
        summary: `Created announcement "${saved.title}"`,
      });
    }
    if (saved.publishedAt && !saved.notifiedAt) {
      if (saved.publishedAt <= now) {
        await publishIfDue(tx, ctx, saved.id, now);
      } else {
        await enqueueJob(
          NOTIFICATION_JOBS.publishAnnouncement,
          { organizationId: ctx.organizationId, announcementId: saved.id },
          { tx, startAfter: saved.publishedAt },
        );
      }
    }
    return { id: saved.id, state: announcementState(saved, now) };
  });
}

/** Ends a live announcement now (it stays in the list as expired). */
export async function endAnnouncement(ctx: ServiceContext, announcementId: string): Promise<void> {
  ctx.permissions.assert(NOTIFICATION_PERMISSIONS.announcementsManage);
  await ctx.db.$transaction(async (tx) => {
    const announcement = await tx.announcement.findFirst({ where: { id: announcementId } });
    if (!announcement) throw new NotFoundError("Announcement", announcementId);
    await tx.announcement.update({
      where: { id: announcementId },
      data: { expiresAt: new Date() },
    });
    await recordAudit(tx, ctx, {
      action: "notifications.announcement.end",
      entityType: "Announcement",
      entityId: announcementId,
      summary: `Ended announcement "${announcement.title}"`,
    });
  });
}

export async function deleteAnnouncement(
  ctx: ServiceContext,
  announcementId: string,
): Promise<void> {
  ctx.permissions.assert(NOTIFICATION_PERMISSIONS.announcementsManage);
  await ctx.db.$transaction(async (tx) => {
    const announcement = await tx.announcement.findFirst({ where: { id: announcementId } });
    if (!announcement) throw new NotFoundError("Announcement", announcementId);
    await tx.announcement.delete({ where: { id: announcementId } });
    await recordAudit(tx, ctx, {
      action: "notifications.announcement.delete",
      entityType: "Announcement",
      entityId: announcementId,
      summary: `Deleted announcement "${announcement.title}"`,
    });
  });
}

export interface MyAnnouncement {
  id: string;
  title: string;
  body: string;
  createdByName: string;
  publishedAt: string;
  read: boolean;
}

/** Live announcements for the signed-in person, newest first (`unreadOnly` for the banner). */
export async function listMyAnnouncements(
  ctx: ServiceContext,
  options: { unreadOnly?: boolean } = {},
): Promise<MyAnnouncement[]> {
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) return [];
  const now = new Date();
  const [me] = await findMembers(ctx.db, { ids: [membershipId] });
  if (!me) return [];
  const live = await ctx.db.announcement.findMany({
    where: {
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(options.unreadOnly ? { reads: { none: { membershipId } } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    include: { reads: { where: { membershipId }, select: { id: true } } },
    take: 50,
  });
  const mine: MyAnnouncement[] = [];
  for (const announcement of live) {
    if (!(await isInAudience(ctx.db, ctx, announcement, me))) continue;
    mine.push({
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      createdByName: announcement.createdByName,
      publishedAt: announcement.publishedAt!.toISOString(),
      read: announcement.reads.length > 0,
    });
  }
  return mine;
}

/** Records that the signed-in person saw these announcements (banner dismissed or page opened). */
export async function markAnnouncementsRead(
  ctx: ServiceContext,
  announcementIds: readonly string[],
): Promise<void> {
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) throw new ForbiddenError("Only people can read announcements.");
  if (announcementIds.length === 0) return;
  const visible = new Set((await listMyAnnouncements(ctx)).map((announcement) => announcement.id));
  const ids = announcementIds.filter((id) => visible.has(id));
  if (ids.length === 0) return;
  await ctx.db.announcementRead.createMany({
    data: ids.map((announcementId) => ({
      organizationId: ctx.organizationId,
      announcementId,
      membershipId,
    })),
    skipDuplicates: true,
  });
}

export { excerpt as announcementExcerpt };

/** Job handler: an announcement scheduled for later goes live. */
export async function runPublishAnnouncementJob(data: {
  organizationId: string;
  announcementId: string;
}): Promise<void> {
  const ctx = createSystemContext(data.organizationId, { name: "Announcements" });
  await ctx.db.$transaction((tx) => publishIfDue(tx, ctx, data.announcementId, new Date()));
}

/** Publishes announcements whose job did not run. Part of the sweep. */
export async function publishDueAnnouncements(
  ctx: ServiceContext,
  now: Date,
  logger?: Logger,
): Promise<number> {
  const due = await ctx.db.announcement.findMany({
    where: {
      notifiedAt: null,
      publishedAt: { lte: new Date(now.getTime() - 60_000) },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
    take: 50,
  });
  let published = 0;
  for (const announcement of due) {
    if (await ctx.db.$transaction((tx) => publishIfDue(tx, ctx, announcement.id, now))) {
      published += 1;
    }
  }
  if (published > 0) {
    logger?.warn(
      { organizationId: ctx.organizationId, published },
      "sweep published announcements",
    );
  }
  return published;
}
