import { BellRing, Megaphone } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { NOTIFICATION_PERMISSIONS } from "./permissions";

/** M06 — notifications & reminders engine (PRD §9, §18, §21, §26). */
export const notificationsManifest: ModuleManifest = {
  key: "notifications",
  planId: "M06",
  name: "Notifications",
  settings: [
    {
      key: "notifications.settings",
      label: "Notifications",
      description:
        "Which notifications are sent and how, reminder lead time and the daily summary.",
      href: "/settings/notifications",
      icon: BellRing,
      group: "Organization",
      order: 30,
      permission: NOTIFICATION_PERMISSIONS.settingsManage,
    },
    {
      key: "notifications.announcements",
      label: "Announcements",
      description: "News for everyone, some roles or a team, shown as a banner and a notification.",
      href: "/settings/announcements",
      icon: Megaphone,
      group: "Organization",
      order: 40,
      permission: NOTIFICATION_PERMISSIONS.announcementsManage,
    },
  ],
  permissions: [
    {
      key: NOTIFICATION_PERMISSIONS.settingsManage,
      label: "Manage notification settings",
      group: "Notifications",
    },
    {
      key: NOTIFICATION_PERMISSIONS.announcementsManage,
      label: "Publish announcements",
      group: "Notifications",
    },
  ],
  contributions: {
    "notification.type": [
      {
        key: "lead.assigned",
        label: "A lead is assigned to me",
        description: "A new lead, or one moved to you by a colleague or a rule.",
        category: "Leads",
        defaultChannels: ["IN_APP", "EMAIL"],
        critical: true,
      },
      {
        key: "lead.moved_away",
        label: "One of my leads is moved",
        description: "Your lead went to a colleague or back to the unassigned queue.",
        category: "Leads",
        defaultChannels: ["IN_APP"],
      },
      {
        key: "lead.duplicate",
        label: "A possible duplicate of my lead",
        description: "Someone entered a lead with the same mobile or e-mail as yours.",
        category: "Leads",
        defaultChannels: ["IN_APP"],
      },
      {
        key: "team.lead_assigned",
        label: "Leads assigned in my team",
        description: "Leads given to or moved between the people reporting to you.",
        category: "Team",
        defaultChannels: ["IN_APP"],
        forManagers: true,
      },
      {
        key: "team.unworked_leads",
        label: "Unworked leads in my team",
        description: "Once a day when leads in your team have waited too long without activity.",
        category: "Team",
        defaultChannels: ["IN_APP", "EMAIL"],
        forManagers: true,
      },
      {
        key: "digest.daily",
        label: "Daily summary",
        description: "Each morning: open, untouched, unworked and unassigned leads.",
        category: "Team",
        defaultChannels: ["EMAIL"],
        forManagers: true,
      },
      {
        key: "reminder",
        label: "Reminders",
        description: "Reminders that come due, e.g. follow-ups and callbacks.",
        category: "Reminders",
        defaultChannels: ["IN_APP", "EMAIL"],
        critical: true,
      },
      {
        key: "import.finished",
        label: "My lead import finished",
        description: "The result of an import you started.",
        category: "System",
        defaultChannels: ["IN_APP", "EMAIL"],
      },
      {
        key: "announcement",
        label: "Announcements",
        description: "News published by your administrators.",
        category: "System",
        defaultChannels: ["IN_APP", "EMAIL"],
        critical: true,
      },
    ],
  },
};
