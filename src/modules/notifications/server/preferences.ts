import { findMembers } from "@/modules/identity";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ForbiddenError, ValidationError } from "@/platform/errors";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { preferenceSchema } from "../schemas";
import type { NotificationChannelValue, NotificationTypeDefinition } from "../types";
import { organizationChannels, resolveChannels } from "./channels";
import { listNotificationTypes, requireNotificationType } from "./registry";
import { getNotificationSettings } from "./settings";

export type PreferenceMap = ReadonlyMap<NotificationChannelValue, boolean>;

/** Stored choices of several members for one type: membershipId → channel → enabled. */
export async function loadPreferences(
  db: TenantDbOrTx,
  membershipIds: readonly string[],
  type: string,
): Promise<Map<string, Map<NotificationChannelValue, boolean>>> {
  const rows = membershipIds.length
    ? await db.notificationPreference.findMany({
        where: { membershipId: { in: [...membershipIds] }, type },
        select: { membershipId: true, channel: true, enabled: true },
      })
    : [];
  const byMember = new Map<string, Map<NotificationChannelValue, boolean>>();
  for (const row of rows) {
    const entry = byMember.get(row.membershipId) ?? new Map<NotificationChannelValue, boolean>();
    entry.set(row.channel, row.enabled);
    byMember.set(row.membershipId, entry);
  }
  return byMember;
}

export interface PreferenceRow {
  key: string;
  label: string;
  description: string;
  category: NotificationTypeDefinition["category"];
  critical: boolean;
  /** Switched off by the organization: nothing is sent, whatever the person chooses. */
  disabledByOrganization: boolean;
  /** The organization's default channels. */
  defaults: NotificationChannelValue[];
  /** What the person gets now (their choices over the defaults). */
  channels: NotificationChannelValue[];
  /** Whether the person changed anything for this type. */
  customized: boolean;
}

function requireMember(ctx: ServiceContext): string {
  const membershipId = ctx.actor.membershipId;
  if (!membershipId) throw new ForbiddenError("Only people can have notification preferences.");
  return membershipId;
}

/** Whether manager-only types can reach this person: they lead a team or see every lead. */
async function isManagerLike(ctx: ServiceContext, membershipId: string): Promise<boolean> {
  if (ctx.permissions.scope(LEAD_PERMISSIONS.view) === "ALL") return true;
  const [me] = await findMembers(ctx.db, { ids: [membershipId] });
  return Boolean(me?.hasReports);
}

/** The signed-in person's notification choices, one row per type that can reach them (M06-07). */
export async function getMyNotificationPreferences(ctx: ServiceContext): Promise<PreferenceRow[]> {
  const membershipId = requireMember(ctx);
  const [settings, stored, manager] = await Promise.all([
    getNotificationSettings(ctx.db, ctx),
    ctx.db.notificationPreference.findMany({
      where: { membershipId },
      select: { type: true, channel: true, enabled: true },
    }),
    isManagerLike(ctx, membershipId),
  ]);
  const types = listNotificationTypes().filter((type) => manager || !type.forManagers);
  return types.map((type) => {
    const mine = new Map<NotificationChannelValue, boolean>(
      stored.filter((row) => row.type === type.key).map((row) => [row.channel, row.enabled]),
    );
    const organization = organizationChannels(type, settings);
    return {
      key: type.key,
      label: type.label,
      description: type.description,
      category: type.category,
      critical: Boolean(type.critical),
      disabledByOrganization: !organization.enabled,
      defaults: organization.channels,
      channels: resolveChannels(type, settings, mine),
      customized: mine.size > 0,
    };
  });
}

/** Switches one channel of one type on or off for the signed-in person. */
export async function setMyNotificationPreference(
  ctx: ServiceContext,
  input: { type: string; channel: NotificationChannelValue; enabled: boolean },
): Promise<void> {
  const membershipId = requireMember(ctx);
  const values = parseInput(preferenceSchema, input);
  const type = requireNotificationType(values.type);
  await ctx.db.$transaction(async (tx) => {
    const settings = await getNotificationSettings(tx, ctx);
    const current = (await loadPreferences(tx, [membershipId], type.key)).get(membershipId);
    const next = new Map(current ?? []);
    next.set(values.channel, values.enabled);
    if (
      type.critical &&
      !values.enabled &&
      !resolveChannels({ ...type, critical: false }, settings, next).length
    ) {
      throw new ValidationError(`"${type.label}" is essential: keep at least one way to get it.`);
    }
    await tx.notificationPreference.upsert({
      where: {
        organizationId_membershipId_type_channel: {
          organizationId: ctx.organizationId,
          membershipId,
          type: type.key,
          channel: values.channel,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        membershipId,
        type: type.key,
        channel: values.channel,
        enabled: values.enabled,
      },
      update: { enabled: values.enabled },
    });
    await recordAudit(tx, ctx, {
      action: "notifications.preference.update",
      entityType: "Membership",
      entityId: membershipId,
      summary: `${values.enabled ? "Turned on" : "Turned off"} "${type.label}" (${
        values.channel === "EMAIL" ? "e-mail" : "in the app"
      })`,
    });
  });
}

/** Back to the organization's defaults for every type. */
export async function resetMyNotificationPreferences(ctx: ServiceContext): Promise<void> {
  const membershipId = requireMember(ctx);
  await ctx.db.$transaction(async (tx) => {
    const { count } = await tx.notificationPreference.deleteMany({ where: { membershipId } });
    if (count === 0) return;
    await recordAudit(tx, ctx, {
      action: "notifications.preference.reset",
      entityType: "Membership",
      entityId: membershipId,
      summary: "Reset notification preferences to the defaults",
    });
  });
}
