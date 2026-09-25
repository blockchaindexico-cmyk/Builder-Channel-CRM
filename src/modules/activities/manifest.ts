import { CalendarCheck, ListTodo, PhoneCall, PhoneForwarded } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { ACTIVITY_TYPES } from "./constants";
import { ACTIVITY_PERMISSIONS } from "./permissions";

/** M07 — calls, follow-ups & callbacks (PRD §8, §9, §10, §22, §26, §27). */
export const activitiesManifest: ModuleManifest = {
  key: "activities",
  planId: "M07",
  name: "Calls & follow-ups",
  nav: [
    {
      key: "activities.agenda",
      label: "My agenda",
      href: "/agenda",
      icon: CalendarCheck,
      section: "main",
      order: 5,
      permission: ACTIVITY_PERMISSIONS.followUpsView,
    },
    {
      key: "activities.calls",
      label: "Calls",
      href: "/calls",
      icon: PhoneCall,
      section: "main",
      order: 12,
      permission: ACTIVITY_PERMISSIONS.callsView,
    },
    {
      key: "activities.team-follow-ups",
      label: "Team follow-ups",
      href: "/team/follow-ups",
      icon: ListTodo,
      section: "workspace",
      order: 32,
      permission: ACTIVITY_PERMISSIONS.teamFollowUpsView,
    },
  ],
  settings: [
    {
      key: "activities.settings",
      label: "Calls & follow-ups",
      description:
        "Call outcomes and the statuses they suggest, follow-up purposes, missed and unresponsive rules.",
      href: "/settings/activities/outcomes",
      icon: PhoneForwarded,
      group: "Sales setup",
      order: 30,
      permission: ACTIVITY_PERMISSIONS.mastersManage,
    },
  ],
  permissions: [
    {
      key: ACTIVITY_PERMISSIONS.callsView,
      label: "View calls",
      description: "See calls — one's own, the team's or everyone's — and their outcomes.",
      group: "Calls & follow-ups",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: ACTIVITY_PERMISSIONS.callsLog,
      label: "Log calls",
      description: "Record calls and their outcome on leads within the scope.",
      group: "Calls & follow-ups",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: ACTIVITY_PERMISSIONS.recordingsListen,
      label: "Listen to call recordings",
      description: "Every playback is recorded in the audit log.",
      group: "Calls & follow-ups",
      defaults: { manager: true },
    },
    {
      key: ACTIVITY_PERMISSIONS.followUpsView,
      label: "View follow-ups and callbacks",
      group: "Calls & follow-ups",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: ACTIVITY_PERMISSIONS.followUpsManage,
      label: "Schedule and update follow-ups",
      description:
        "Schedule, complete, reschedule and cancel follow-ups and callbacks on leads within the scope.",
      group: "Calls & follow-ups",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: ACTIVITY_PERMISSIONS.teamFollowUpsView,
      label: "View the team follow-up board",
      group: "Calls & follow-ups",
      scoped: true,
      defaults: { manager: "TEAM" },
    },
    {
      key: ACTIVITY_PERMISSIONS.mastersManage,
      label: "Manage call outcomes and follow-up settings",
      group: "Calls & follow-ups",
    },
  ],
  contributions: {
    "lead.timeline": [
      { type: ACTIVITY_TYPES.CALL_LOGGED, label: "Call", tone: "info" },
      { type: ACTIVITY_TYPES.CALL_RECORDING_ADDED, label: "Recording", tone: "muted" },
      { type: ACTIVITY_TYPES.FOLLOW_UP_SCHEDULED, label: "Follow-up scheduled", tone: "secondary" },
      { type: ACTIVITY_TYPES.FOLLOW_UP_COMPLETED, label: "Follow-up done", tone: "success" },
      { type: ACTIVITY_TYPES.FOLLOW_UP_RESCHEDULED, label: "Rescheduled", tone: "warning" },
      { type: ACTIVITY_TYPES.FOLLOW_UP_CANCELLED, label: "Cancelled", tone: "muted" },
      { type: ACTIVITY_TYPES.FOLLOW_UP_MISSED, label: "Missed", tone: "destructive" },
      { type: ACTIVITY_TYPES.FOLLOW_UP_TRANSFERRED, label: "Follow-ups moved", tone: "muted" },
    ],
    "notification.type": [
      {
        key: "followup.assigned",
        label: "A follow-up is scheduled for me",
        description: "Someone else scheduled a follow-up or callback on one of your leads.",
        category: "Reminders",
        defaultChannels: ["IN_APP"],
        emailAction: "Open the lead",
      },
      {
        key: "followup.missed",
        label: "One of my follow-ups was missed",
        description: "A follow-up or callback passed its time without being done.",
        category: "Reminders",
        defaultChannels: ["IN_APP", "EMAIL"],
        emailAction: "Open my agenda",
      },
      {
        key: "team.followups_overdue",
        label: "Overdue follow-ups in my team",
        description: "Once a day when follow-ups or callbacks in your team are overdue.",
        category: "Team",
        defaultChannels: ["IN_APP", "EMAIL"],
        forManagers: true,
        emailAction: "Open team follow-ups",
      },
    ],
  },
};
