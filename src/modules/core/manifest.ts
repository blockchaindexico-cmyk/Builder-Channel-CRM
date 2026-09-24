import { Activity, LayoutDashboard, Settings } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { CORE_PERMISSIONS } from "./permissions";

/** M01 — application-wide navigation entries and system status (health + event log). */
export const coreManifest: ModuleManifest = {
  key: "core",
  planId: "M01",
  name: "Core",
  nav: [
    {
      key: "core.dashboard",
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      section: "main",
      order: 0,
    },
    {
      key: "core.settings",
      label: "Settings",
      href: "/settings",
      icon: Settings,
      section: "admin",
      order: 100,
      permission: CORE_PERMISSIONS.settingsAccess,
    },
  ],
  settings: [
    {
      key: "core.system-status",
      label: "System status",
      description:
        "Health of the database, file storage and background worker, and the domain-event log.",
      href: "/settings/system",
      icon: Activity,
      group: "System",
      order: 10,
      permission: CORE_PERMISSIONS.systemStatus,
    },
  ],
  permissions: [
    { key: CORE_PERMISSIONS.settingsAccess, label: "Open settings", group: "Core" },
    {
      key: CORE_PERMISSIONS.systemStatus,
      label: "View system status",
      description: "Health checks and the domain-event log.",
      group: "Core",
    },
  ],
};
