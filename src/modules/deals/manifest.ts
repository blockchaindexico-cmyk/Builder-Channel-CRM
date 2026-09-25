import { Handshake, MapPinned, Trophy } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { DEAL_TYPES } from "./constants";
import { DEAL_PERMISSIONS } from "./permissions";

/** M08 — site visits, revisits, bookings & closures (PRD §6, §11, §12, §17, §22, §28). */
export const dealsManifest: ModuleManifest = {
  key: "deals",
  planId: "M08",
  name: "Visits & bookings",
  nav: [
    {
      key: "deals.visits",
      label: "Site visits",
      href: "/visits",
      icon: MapPinned,
      section: "main",
      order: 13,
      permission: DEAL_PERMISSIONS.visitsView,
    },
    {
      key: "deals.bookings",
      label: "Bookings",
      href: "/bookings",
      icon: Trophy,
      section: "main",
      order: 14,
      permission: DEAL_PERMISSIONS.bookingsView,
    },
  ],
  settings: [
    {
      key: "deals.settings",
      label: "Visits & bookings",
      description:
        "Visit outcomes, loss reasons, booking stages, visit reminders and what moves with a reassigned lead.",
      href: "/settings/deals/outcomes",
      icon: Handshake,
      group: "Sales setup",
      order: 35,
      permission: DEAL_PERMISSIONS.mastersManage,
    },
  ],
  permissions: [
    {
      key: DEAL_PERMISSIONS.visitsView,
      label: "View site visits",
      description:
        "See visits and revisits — one's own, the team's or everyone's — and their outcomes.",
      group: "Visits & bookings",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: DEAL_PERMISSIONS.visitsManage,
      label: "Schedule and update site visits",
      description:
        "Plan visits and revisits, confirm them, record outcomes and no-shows, move and cancel them.",
      group: "Visits & bookings",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: DEAL_PERMISSIONS.bookingsView,
      label: "View bookings",
      description: "See bookings credited to oneself, the team or everyone, with their history.",
      group: "Visits & bookings",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: DEAL_PERMISSIONS.bookingsManage,
      label: "Create and update bookings",
      description:
        "Convert leads to bookings, edit them, move them through their stages and add documents.",
      group: "Visits & bookings",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: DEAL_PERMISSIONS.bookingsClose,
      label: "Close or cancel bookings",
      description: "Mark bookings as closed/won or cancel them with a reason.",
      group: "Visits & bookings",
      scoped: true,
      defaults: { manager: "TEAM" },
    },
    {
      key: DEAL_PERMISSIONS.bookingsViewValue,
      label: "See booking values",
      description:
        "Agreement values and token amounts — hidden from everyone else (they cannot enter them either).",
      group: "Visits & bookings",
    },
    {
      key: DEAL_PERMISSIONS.markLost,
      label: "Mark leads lost or not interested",
      description: "Close leads as Lost or Not Interested, with a reason.",
      group: "Leads",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: DEAL_PERMISSIONS.mastersManage,
      label: "Manage visit and booking settings",
      group: "Visits & bookings",
    },
  ],
  contributions: {
    "lead.timeline": [
      { type: DEAL_TYPES.VISIT_SCHEDULED, label: "Visit planned", tone: "info" },
      { type: DEAL_TYPES.VISIT_CONFIRMED, label: "Visit confirmed", tone: "secondary" },
      { type: DEAL_TYPES.VISIT_COMPLETED, label: "Visit done", tone: "success" },
      { type: DEAL_TYPES.VISIT_NO_SHOW, label: "No-show", tone: "destructive" },
      { type: DEAL_TYPES.VISIT_CANCELLED, label: "Visit cancelled", tone: "muted" },
      { type: DEAL_TYPES.VISIT_RESCHEDULED, label: "Visit moved", tone: "warning" },
      { type: DEAL_TYPES.VISITS_TRANSFERRED, label: "Visits moved", tone: "muted" },
      { type: DEAL_TYPES.BOOKING_CREATED, label: "Booking", tone: "success" },
      { type: DEAL_TYPES.BOOKING_UPDATED, label: "Booking updated", tone: "secondary" },
      { type: DEAL_TYPES.BOOKING_STAGE_CHANGED, label: "Booking stage", tone: "info" },
      { type: DEAL_TYPES.BOOKING_CLOSED, label: "Deal closed", tone: "success" },
      { type: DEAL_TYPES.BOOKING_CANCELLED, label: "Booking cancelled", tone: "destructive" },
    ],
    "lead.list.preset": [
      {
        key: "deals.visit-pending",
        label: "Visits waiting for an outcome",
        query: "visit=pending-outcome",
        order: 10,
        permission: DEAL_PERMISSIONS.visitsView,
      },
      {
        key: "deals.visited-not-booked",
        label: "Visited, not booked",
        query: "visit=visited&booking=none&closure=open",
        order: 20,
        permission: DEAL_PERMISSIONS.visitsView,
      },
      { key: "deals.won", label: "Closed / Won", query: "closure=won", order: 30 },
      { key: "deals.lost", label: "Lost leads", query: "closure=lost", order: 40 },
      {
        key: "deals.not-interested",
        label: "Not interested",
        query: "closure=not-interested",
        order: 50,
      },
    ],
    "notification.type": [
      {
        key: "visit.assigned",
        label: "A site visit is planned for me",
        description: "Someone else planned a visit or revisit on one of your leads.",
        category: "Reminders",
        defaultChannels: ["IN_APP"],
        emailAction: "Open the lead",
      },
      {
        key: "visit.outcome_pending",
        label: "One of my visits needs its outcome",
        description: "A visit passed its time some hours ago and nothing was recorded.",
        category: "Reminders",
        defaultChannels: ["IN_APP"],
        emailAction: "Record the outcome",
      },
      {
        key: "team.visits_pending_outcome",
        label: "Visits in my team without an outcome",
        description: "Once a day when visits of your team have no outcome recorded.",
        category: "Team",
        defaultChannels: ["IN_APP"],
        forManagers: true,
        emailAction: "Open site visits",
      },
      {
        key: "booking.update",
        label: "Bookings and closures",
        description: "A booking is made, a deal is closed or a booking is cancelled in your area.",
        category: "Leads",
        defaultChannels: ["IN_APP", "EMAIL"],
        emailAction: "Open the booking",
      },
    ],
  },
};
