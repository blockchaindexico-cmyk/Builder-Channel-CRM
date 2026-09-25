import { getRegionalSettings } from "@/modules/organization";
import { defineEventHandler } from "@/platform/events/define";
import type { DomainEventType } from "@/platform/events/types";

import { localDay } from "./aggregates";
import { scheduleDayRefresh } from "./jobs";

/**
 * Activity that changes the daily counters (M10-03): each queues a refresh of the day it happened on (debounced
 * per organization and day). Back-dated entries are caught by the nightly reconciliation.
 */
const ACTIVITY_EVENTS = [
  "lead.created",
  "lead.assigned",
  "lead.reassigned",
  "lead.lost",
  "lead.not_interested",
  "lead.status_changed",
  "call.logged",
  "followup.completed",
  "followup.missed",
  "followup.scheduled",
  "followup.rescheduled",
  "followup.cancelled",
  "visit.completed",
  "visit.no_show",
  "booking.created",
  "booking.updated",
  "booking.closed",
  "booking.cancelled",
] as const satisfies readonly DomainEventType[];

export const analyticsEventHandlers = ACTIVITY_EVENTS.map((type) =>
  defineEventHandler({
    name: `analytics.refresh-on-${type.replace(/[._]/g, "-")}`,
    event: type,
    handle: async (event, ctx) => {
      const { timezone } = await getRegionalSettings(ctx);
      await scheduleDayRefresh(ctx, localDay(new Date(event.occurredAt), timezone));
    },
  }),
);
