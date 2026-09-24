import { KeyRound, ScrollText, Users, UsersRound } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { IDENTITY_PERMISSIONS } from "./permissions";

/** M02 — users, roles & permissions, team structure, audit log (PRD §3, §13, §14, §20, §21). */
export const identityManifest: ModuleManifest = {
  key: "identity",
  planId: "M02",
  name: "Users & access",
  nav: [
    {
      key: "identity.team",
      label: "My team",
      href: "/team",
      icon: UsersRound,
      section: "workspace",
      order: 90,
      permission: IDENTITY_PERMISSIONS.usersView,
    },
  ],
  settings: [
    {
      key: "identity.users",
      label: "Users",
      description: "Invite people, set their role and reporting manager, deactivate accounts.",
      href: "/settings/users",
      icon: Users,
      group: "Users & access",
      order: 10,
      permission: IDENTITY_PERMISSIONS.usersManage,
    },
    {
      key: "identity.roles",
      label: "Roles & permissions",
      description: "Decide what each role can see and do, and on whose records.",
      href: "/settings/roles",
      icon: KeyRound,
      group: "Users & access",
      order: 20,
      permission: IDENTITY_PERMISSIONS.rolesManage,
    },
    {
      key: "identity.audit",
      label: "Audit log",
      description: "Who changed what and when, with previous values.",
      href: "/settings/audit-log",
      icon: ScrollText,
      group: "Users & access",
      order: 30,
      permission: IDENTITY_PERMISSIONS.auditView,
    },
  ],
  permissions: [
    {
      key: IDENTITY_PERMISSIONS.usersView,
      label: "View team members",
      description: "See people and the reporting structure (own team or whole organization).",
      group: "Users & access",
      scoped: true,
      defaults: { manager: "TEAM" },
    },
    {
      key: IDENTITY_PERMISSIONS.usersManage,
      label: "Manage users",
      description: "Invite, edit and deactivate users; reset passwords.",
      group: "Users & access",
    },
    {
      key: IDENTITY_PERMISSIONS.rolesManage,
      label: "Manage roles & permissions",
      group: "Users & access",
    },
    { key: IDENTITY_PERMISSIONS.auditView, label: "View audit log", group: "Users & access" },
  ],
};
