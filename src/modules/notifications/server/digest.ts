import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { zonedClock } from "@/lib/date-range";
import { findMembers } from "@/modules/identity";
import { LEAD_PERMISSIONS } from "@/modules/leads";
import { getRegionalSettings } from "@/modules/organization";
import { getServerRegistry } from "@/modules/registry.server";
import type { Logger } from "@/platform/logger";
import type { ServiceContext } from "@/platform/tenant/context";
import { createMemberContext } from "@/platform/tenant/member-context";

import { DIGEST_WINDOW_MINUTES } from "../constants";
import type { DigestBlock } from "../extensions";
import { resolveChannels } from "./channels";
import { notify } from "./notify";
import { loadPreferences } from "./preferences";
import { requireNotificationType } from "./registry";
import { getNotificationSettings } from "./settings";

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
};

/** Whether local `time` is at or up to `window` minutes after `start` (same day). */
export function isWithinDigestWindow(time: string, start: string, window = DIGEST_WINDOW_MINUTES) {
  const elapsed = minutesOf(time) - minutesOf(start);
  return elapsed >= 0 && elapsed < window;
}

/** One-line version of the summary for the bell. */
export function summarizeDigest(blocks: readonly DigestBlock[]): string {
  const lines = blocks.flatMap((block) => block.lines);
  const worth = lines.filter((line) => line.attention && line.value > 0);
  const shown = (worth.length ? worth : lines.slice(0, 1)).slice(0, 3);
  return shown.map((line) => `${line.label}: ${line.display ?? line.value}`).join(" · ");
}

/**
 * Daily summary for managers and admins (M06-12): checked every 15 minutes and sent once per local day, at the
 * configured time in the organization's time zone (or within the next three hours if the worker was busy or down).
 * Everyone with a team or organization-wide view of leads gets one; they can turn it off in their preferences.
 */
export async function sendDailyDigests(
  ctx: ServiceContext,
  now: Date,
  logger?: Logger,
): Promise<number> {
  const settings = await getNotificationSettings(ctx.db, ctx);
  if (!settings.digestEnabled) return 0;
  const { timezone } = await getRegionalSettings(ctx);
  const clock = zonedClock(now, timezone);
  if (!isWithinDigestWindow(clock.time, settings.digestTime)) return 0;

  const idempotencyKey = `digest:${clock.date}`;
  const members = (
    await findMembers(ctx.db, {
      activeOnly: true,
      withPermission: LEAD_PERMISSIONS.view,
      scopes: ["TEAM", "ALL"],
    })
  ).filter((member) => member.scope === "ALL" || member.hasReports);
  if (members.length === 0) return 0;
  const done = new Set(
    (
      await ctx.db.notification.findMany({
        where: {
          idempotencyKey,
          recipientId: { in: members.map((member) => member.membershipId) },
        },
        select: { recipientId: true },
      })
    ).map((row) => row.recipientId),
  );
  // Skip people who turned the summary off before building anything for them.
  const type = requireNotificationType("digest.daily");
  const preferences = await loadPreferences(
    ctx.db,
    members.map((member) => member.membershipId),
    type.key,
  );
  const wanted = members.filter(
    (member) =>
      !done.has(member.membershipId) &&
      resolveChannels(type, settings, preferences.get(member.membershipId)).length > 0,
  );
  const sections = [...getServerRegistry().extensions("notifications.digest-section")].sort(
    (a, b) => a.order - b.order,
  );
  const dateLabel = format(new TZDate(now, timezone), "EEEE, d MMMM");

  let sent = 0;
  for (const member of wanted) {
    const memberCtx = await createMemberContext(ctx.organizationId, member.membershipId, {
      requestId: ctx.requestId,
    });
    if (!memberCtx) continue;
    const blocks = (
      await Promise.all(sections.map((section) => section.build(memberCtx, now)))
    ).filter((block): block is DigestBlock => block !== null && block.lines.length > 0);
    if (blocks.length === 0) continue;
    const result = await notify(ctx, {
      type: "digest.daily",
      recipientIds: [member.membershipId],
      title: `Your summary for ${dateLabel}`,
      body: summarizeDigest(blocks),
      link: "/",
      data: { dateLabel, sections: blocks } as unknown as object,
      idempotencyKey,
    });
    sent += result.createdIds.length;
  }
  if (sent > 0) logger?.info({ organizationId: ctx.organizationId, sent }, "daily summaries sent");
  return sent;
}
