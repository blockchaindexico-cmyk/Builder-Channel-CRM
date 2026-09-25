import { zonedClock } from "@/lib/date-range";
import { getRegionalSettings } from "@/modules/organization";
import { getServerRegistry } from "@/modules/registry.server";
import type { Logger } from "@/platform/logger";
import type { ServiceContext } from "@/platform/tenant/context";

import { ALERT_HOURS } from "../constants";
import { notify } from "./notify";

/**
 * Manager alerts (M06-11): every rule registered at `notifications.alert-rule` is evaluated hourly during
 * working hours in the organization's time zone. Rules return candidates; each `dedupeKey` is sent once.
 */
export async function evaluateAlertRules(
  ctx: ServiceContext,
  now: Date,
  logger?: Logger,
): Promise<number> {
  const { timezone } = await getRegionalSettings(ctx);
  const { time } = zonedClock(now, timezone);
  if (time < ALERT_HOURS.from || time >= ALERT_HOURS.until) return 0;

  let sent = 0;
  for (const rule of getServerRegistry().extensions("notifications.alert-rule")) {
    const candidates = await rule.evaluate(ctx, now);
    for (const candidate of candidates) {
      const result = await notify(ctx, {
        type: candidate.type,
        recipientIds: [candidate.recipientId],
        title: candidate.title,
        body: candidate.body,
        link: candidate.link,
        priority: candidate.priority ?? "NORMAL",
        idempotencyKey: `alert:${rule.key}:${candidate.dedupeKey}`,
      });
      sent += result.createdIds.length;
    }
  }
  if (sent > 0) logger?.info({ organizationId: ctx.organizationId, sent }, "manager alerts sent");
  return sent;
}
