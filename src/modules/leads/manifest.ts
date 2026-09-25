import { Contact, KeyRound, ListChecks } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { LEAD_PERMISSIONS } from "./permissions";

/** M04 — lead management core (PRD §5, §6, §22, §23, §28, §29). */
export const leadsManifest: ModuleManifest = {
  key: "leads",
  planId: "M04",
  name: "Leads",
  nav: [
    {
      key: "leads.list",
      label: "Leads",
      href: "/leads",
      icon: Contact,
      section: "main",
      order: 10,
      permission: LEAD_PERMISSIONS.view,
    },
  ],
  settings: [
    {
      key: "leads.settings",
      label: "Lead settings",
      description: "Lead statuses, sources, campaigns and the duplicate policy.",
      href: "/settings/leads/statuses",
      icon: ListChecks,
      group: "Sales setup",
      order: 20,
      permission: LEAD_PERMISSIONS.mastersManage,
    },
    {
      key: "leads.api-keys",
      label: "API keys",
      description: "Keys for website forms and portals that send leads to the intake API.",
      href: "/settings/api-keys",
      icon: KeyRound,
      group: "System",
      order: 20,
      permission: LEAD_PERMISSIONS.apiKeysManage,
    },
  ],
  permissions: [
    {
      key: LEAD_PERMISSIONS.view,
      label: "View leads",
      description: "See leads, their history, notes and attachments.",
      group: "Leads",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: LEAD_PERMISSIONS.create,
      label: "Create leads",
      group: "Leads",
      defaults: { manager: true, executive: true },
    },
    {
      key: LEAD_PERMISSIONS.update,
      label: "Edit leads",
      description: "Change contact details and requirements; add notes and attachments.",
      group: "Leads",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: LEAD_PERMISSIONS.changeStatus,
      label: "Change lead status",
      group: "Leads",
      scoped: true,
      defaults: { manager: "TEAM", executive: "OWN" },
    },
    {
      key: LEAD_PERMISSIONS.statusOverride,
      label: "Override workflow statuses",
      description:
        "Set statuses normally driven by workflows (Assigned, Visit, Booking, Closed/Won) by hand.",
      group: "Leads",
    },
    {
      key: LEAD_PERMISSIONS.reopen,
      label: "Reopen closed leads",
      description: "Move a lead out of Closed/Won, Lost, Not Interested or Invalid.",
      group: "Leads",
      defaults: { manager: true },
    },
    { key: LEAD_PERMISSIONS.merge, label: "Review and merge duplicates", group: "Leads" },
    { key: LEAD_PERMISSIONS.import, label: "Import leads", group: "Leads" },
    { key: LEAD_PERMISSIONS.export, label: "Export leads", group: "Leads" },
    {
      key: LEAD_PERMISSIONS.delete,
      label: "Delete leads",
      description: "Remove junk or test leads.",
      group: "Leads",
    },
    { key: LEAD_PERMISSIONS.mastersManage, label: "Manage lead settings", group: "Leads" },
    { key: LEAD_PERMISSIONS.apiKeysManage, label: "Manage API keys", group: "Leads" },
  ],
};
