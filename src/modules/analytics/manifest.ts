import { ChartColumnBig } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import type {} from "./extensions";
import { ANALYTICS_PERMISSIONS } from "./permissions";

/** M10 — dashboards, reports & analytics (PRD §10, §13, §15, §16, §21). */
export const analyticsManifest: ModuleManifest = {
  key: "analytics",
  planId: "M10",
  name: "Dashboards & reports",
  nav: [
    {
      key: "analytics.reports",
      label: "Reports",
      href: "/reports",
      icon: ChartColumnBig,
      section: "insights",
      order: 10,
      permission: ANALYTICS_PERMISSIONS.reportsView,
      match: ["/reports/exports"],
    },
  ],
  permissions: [
    {
      key: ANALYTICS_PERMISSIONS.reportsView,
      label: "View reports and dashboard figures",
      description:
        "Calls, follow-ups, visits, bookings and lead reports — for oneself, the team or the whole organization.",
      group: "Reports",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: ANALYTICS_PERMISSIONS.reportsExport,
      label: "Export reports",
      description: "Download reports as CSV or Excel (within the data one can see).",
      group: "Reports",
      defaults: { manager: true },
    },
  ],
  contributions: {
    "report.catalog": [
      {
        key: "executives",
        title: "Executives & teams",
        description:
          "Calls, follow-ups, visits, bookings and closures per executive or per manager's team.",
        group: "Performance",
        href: "/reports/executives",
        order: 10,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "leads",
        title: "Lead database",
        description:
          "Every lead with its status, owner, source, projects and milestones — filter and export.",
        group: "Leads",
        href: "/reports/leads",
        order: 20,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "funnel",
        title: "Funnel & sources",
        description:
          "Stage-to-stage conversion, time to each stage, and how each source and campaign performs.",
        group: "Leads",
        href: "/reports/funnel",
        order: 30,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "lost",
        title: "Lost leads",
        description: "Leads lost or not interested, by reason, executive and source.",
        group: "Leads",
        href: "/reports/lost",
        order: 40,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "calls",
        title: "Calling",
        description: "Call volume, connect rate and outcomes by executive and day.",
        group: "Activities",
        href: "/reports/calls",
        order: 50,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "follow-ups",
        title: "Follow-ups",
        description:
          "Upcoming, completed, missed and overdue follow-ups and callbacks, with adherence.",
        group: "Activities",
        href: "/reports/follow-ups",
        order: 60,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "visits",
        title: "Site visits",
        description:
          "Visits, revisits and outcomes, and how visits turn into bookings and closures.",
        group: "Deals",
        href: "/reports/visits",
        order: 70,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
      {
        key: "bookings",
        title: "Bookings & closed business",
        description: "Bookings and closures by builder, project, manager, executive and date.",
        group: "Deals",
        href: "/reports/bookings",
        order: 80,
        permission: ANALYTICS_PERMISSIONS.reportsView,
      },
    ],
    "notification.type": [
      {
        key: "report.export_ready",
        label: "My report export is ready",
        description: "A large export you asked for has finished and can be downloaded.",
        category: "System",
        defaultChannels: ["IN_APP"],
        emailAction: "Open my exports",
      },
    ],
  },
};
