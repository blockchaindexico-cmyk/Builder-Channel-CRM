import { TZDate } from "@date-fns/tz";
import { addDays, startOfDay } from "date-fns";

import type { LeadListFilter } from "@/modules/leads";

import { OPEN_FOLLOW_UP_STATUSES } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import { listCallOutcomes } from "./masters";
import { getActivitySettings } from "./settings";

const OPEN = [...OPEN_FOLLOW_UP_STATUSES];

/** Start of today and tomorrow in the organization's time zone. */
function todayBounds(now: Date, timezone: string) {
  const start = startOfDay(new TZDate(now, timezone));
  return { start: new Date(start.getTime()), end: new Date(addDays(start, 1).getTime()) };
}

/** Lead list filters contributed by M07 (M07-16): follow-up status, callbacks, calls and the last outcome. */
export const followUpFilter: LeadListFilter = {
  key: "followUp",
  label: "Follow-up",
  order: 10,
  options: (ctx) =>
    ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsView)
      ? [
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Due today" },
          { value: "upcoming", label: "Upcoming" },
          { value: "none", label: "None planned" },
        ]
      : [],
  where(value, { timezone, now }) {
    switch (value) {
      case "overdue":
        return { followUps: { some: { status: { in: OPEN }, dueAt: { lt: now } } } };
      case "today": {
        const { start, end } = todayBounds(now, timezone);
        return { followUps: { some: { status: { in: OPEN }, dueAt: { gte: start, lt: end } } } };
      }
      case "upcoming":
        return { followUps: { some: { status: "SCHEDULED", dueAt: { gte: now } } } };
      case "none":
        return { followUps: { none: { status: { in: OPEN } } } };
      default:
        return null;
    }
  },
};

export const callbackFilter: LeadListFilter = {
  key: "callback",
  label: "Callback",
  order: 20,
  options: (ctx) =>
    ctx.permissions.has(ACTIVITY_PERMISSIONS.followUpsView)
      ? [{ value: "pending", label: "Callback pending" }]
      : [],
  where: (value) =>
    value === "pending"
      ? { followUps: { some: { type: "CALLBACK", status: { in: OPEN } } } }
      : null,
};

export const callsFilter: LeadListFilter = {
  key: "calls",
  label: "Calls",
  order: 30,
  async options(ctx) {
    if (!ctx.permissions.has(ACTIVITY_PERMISSIONS.callsView)) return [];
    const { unresponsiveAfterAttempts } = await getActivitySettings(ctx.db, ctx);
    return [
      { value: "never-called", label: "Never called" },
      { value: "never-reached", label: "Never reached" },
      {
        value: "unanswered",
        label: `${unresponsiveAfterAttempts}+ unanswered in a row`,
      },
    ];
  },
  async where(value, { ctx }) {
    switch (value) {
      case "never-called":
        return { lastCallAt: null };
      case "never-reached":
        return { lastContactedAt: null };
      case "unanswered": {
        const { unresponsiveAfterAttempts } = await getActivitySettings(ctx.db, ctx);
        return { callAttempts: { gte: unresponsiveAfterAttempts } };
      }
      default:
        return null;
    }
  },
};

export const lastOutcomeFilter: LeadListFilter = {
  key: "lastOutcome",
  label: "Last call outcome",
  order: 40,
  async options(ctx) {
    if (!ctx.permissions.has(ACTIVITY_PERMISSIONS.callsView)) return [];
    const outcomes = await listCallOutcomes(ctx);
    return outcomes.map((outcome) => ({
      value: outcome.id,
      label: outcome.isActive ? outcome.label : `${outcome.label} (inactive)`,
    }));
  },
  where: (value) =>
    /^[0-9a-f-]{36}$/i.test(value) ? { lastCallOutcomeId: value.toLowerCase() } : null,
};

export const activityLeadFilters = [followUpFilter, callbackFilter, callsFilter, lastOutcomeFilter];
