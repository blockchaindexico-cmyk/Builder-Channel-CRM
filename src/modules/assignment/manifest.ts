import { Gauge, Inbox, Shuffle } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { ASSIGNMENT_PERMISSIONS } from "./permissions";

/** M05 — lead assignment, reassignment & team workload (PRD §7, §13, §28). */
export const assignmentManifest: ModuleManifest = {
  key: "assignment",
  planId: "M05",
  name: "Lead assignment",
  nav: [
    {
      key: "assignment.unassigned",
      label: "Unassigned",
      href: "/leads/unassigned",
      icon: Inbox,
      section: "main",
      order: 11,
      permission: ASSIGNMENT_PERMISSIONS.assign,
    },
    {
      key: "assignment.workload",
      label: "Team workload",
      href: "/team/workload",
      icon: Gauge,
      section: "workspace",
      order: 31,
      permission: ASSIGNMENT_PERMISSIONS.workloadView,
    },
  ],
  settings: [
    {
      key: "assignment.settings",
      label: "Lead assignment",
      description:
        "Automatic assignment rules, reassignment reasons and the unworked-lead threshold.",
      href: "/settings/assignment/rules",
      icon: Shuffle,
      group: "Sales setup",
      order: 25,
      permission: ASSIGNMENT_PERMISSIONS.rulesManage,
    },
  ],
  permissions: [
    {
      key: ASSIGNMENT_PERMISSIONS.assign,
      label: "Assign leads",
      description: "Give unassigned leads an owner — within the scope (a team, or everyone).",
      group: "Lead assignment",
      scoped: true,
      defaults: { manager: "TEAM" },
    },
    {
      key: ASSIGNMENT_PERMISSIONS.reassign,
      label: "Reassign leads",
      description: "Move leads between owners or back to the queue, with a reason.",
      group: "Lead assignment",
      scoped: true,
      defaults: { manager: "TEAM" },
    },
    {
      key: ASSIGNMENT_PERMISSIONS.workloadView,
      label: "View team workload",
      group: "Lead assignment",
      scoped: true,
      defaults: { manager: "TEAM" },
    },
    {
      key: ASSIGNMENT_PERMISSIONS.rulesManage,
      label: "Manage assignment rules and reasons",
      group: "Lead assignment",
    },
  ],
  contributions: {
    "lead.timeline": [
      { type: "ASSIGNED", label: "Assigned", tone: "info" },
      { type: "REASSIGNED", label: "Reassigned", tone: "warning" },
      { type: "UNASSIGNED", label: "Unassigned", tone: "muted" },
    ],
  },
};
