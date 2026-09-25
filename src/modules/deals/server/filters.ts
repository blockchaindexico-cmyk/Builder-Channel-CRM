import type { LeadListFilter } from "@/modules/leads";
import { LEAD_PERMISSIONS } from "@/modules/leads";

import { OPEN_VISIT_STATUSES } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { listLossReasons } from "./masters";

const OPEN = [...OPEN_VISIT_STATUSES];

/** Lead list filters contributed by M08 (M08-12): visits, revisits, bookings, closure and loss reason. */
export const visitFilter: LeadListFilter = {
  key: "visit",
  label: "Site visit",
  order: 50,
  options: (ctx) =>
    ctx.permissions.has(DEAL_PERMISSIONS.visitsView)
      ? [
          { value: "upcoming", label: "Visit coming up" },
          { value: "pending-outcome", label: "Waiting for its outcome" },
          { value: "visited", label: "Visited" },
          { value: "not-visited", label: "Not visited yet" },
        ]
      : [],
  where(value, { now }) {
    switch (value) {
      case "upcoming":
        return { siteVisits: { some: { status: { in: OPEN }, scheduledAt: { gte: now } } } };
      case "pending-outcome":
        return { siteVisits: { some: { status: { in: OPEN }, scheduledAt: { lt: now } } } };
      case "visited":
        return { siteVisits: { some: { status: "COMPLETED" } } };
      case "not-visited":
        return { siteVisits: { none: { status: "COMPLETED" } } };
      default:
        return null;
    }
  },
};

export const revisitFilter: LeadListFilter = {
  key: "revisit",
  label: "Revisit",
  order: 51,
  options: (ctx) =>
    ctx.permissions.has(DEAL_PERMISSIONS.visitsView)
      ? [
          { value: "yes", label: "Has a revisit" },
          { value: "no", label: "No revisit" },
        ]
      : [],
  where(value) {
    const revisit = {
      isRevisit: true,
      status: { notIn: ["CANCELLED" as const, "RESCHEDULED" as const] },
    };
    if (value === "yes") return { siteVisits: { some: revisit } };
    if (value === "no") return { siteVisits: { none: revisit } };
    return null;
  },
};

export const bookingFilter: LeadListFilter = {
  key: "booking",
  label: "Booking",
  order: 52,
  options: (ctx) =>
    ctx.permissions.has(DEAL_PERMISSIONS.bookingsView)
      ? [
          { value: "active", label: "Booking in progress" },
          { value: "closed", label: "Closed / Won" },
          { value: "cancelled", label: "Booking cancelled" },
          { value: "none", label: "No booking" },
        ]
      : [],
  where(value) {
    switch (value) {
      case "active":
        return { bookings: { some: { status: "ACTIVE" } } };
      case "closed":
        return { bookings: { some: { status: "CLOSED_WON" } } };
      case "cancelled":
        return { bookings: { some: { status: "CANCELLED" } } };
      case "none":
        return { bookings: { none: {} } };
      default:
        return null;
    }
  },
};

export const closureFilter: LeadListFilter = {
  key: "closure",
  label: "Closure",
  order: 53,
  options: (ctx) =>
    ctx.permissions.has(LEAD_PERMISSIONS.view)
      ? [
          { value: "open", label: "Still open" },
          { value: "won", label: "Closed / Won" },
          { value: "lost", label: "Lost" },
          { value: "not-interested", label: "Not interested" },
        ]
      : [],
  where(value) {
    switch (value) {
      case "open":
        return { status: { isTerminal: false } };
      case "won":
        return { status: { category: "WON" } };
      case "lost":
        return { status: { category: "LOST", key: { not: "NOT_INTERESTED" } } };
      case "not-interested":
        return { status: { key: "NOT_INTERESTED" } };
      default:
        return null;
    }
  },
};

export const lossReasonFilter: LeadListFilter = {
  key: "lossReason",
  label: "Loss reason",
  order: 54,
  async options(ctx) {
    if (!ctx.permissions.has(LEAD_PERMISSIONS.view)) return [];
    const reasons = await listLossReasons(ctx);
    return reasons
      .filter((reason) => reason.appliesTo.some((scope) => scope !== "BOOKING_CANCELLED"))
      .map((reason) => ({
        value: reason.id,
        label: reason.isActive ? reason.label : `${reason.label} (inactive)`,
      }));
  },
  where: (value) => (/^[0-9a-f-]{36}$/i.test(value) ? { lossReasonId: value.toLowerCase() } : null),
};

export const dealLeadFilters = [
  visitFilter,
  revisitFilter,
  bookingFilter,
  closureFilter,
  lossReasonFilter,
];
