import { ChartColumnBig } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

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
