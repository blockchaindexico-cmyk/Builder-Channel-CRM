import { Building2 } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { ORGANIZATION_PERMISSIONS } from "./permissions";

/** M01 — organization profile & regional settings (PRD §26 "Organization/profile settings"). */
export const organizationManifest: ModuleManifest = {
  key: "organization",
  planId: "M01",
  name: "Organization",
  settings: [
    {
      key: "organization.profile",
      label: "Organization profile",
      description: "Company details, logo, address, timezone, currency and date format.",
      href: "/settings/organization",
      icon: Building2,
      group: "Organization",
      order: 10,
      permission: ORGANIZATION_PERMISSIONS.view,
    },
  ],
  permissions: [
    {
      key: ORGANIZATION_PERMISSIONS.view,
      label: "View organization settings",
      group: "Organization",
    },
    {
      key: ORGANIZATION_PERMISSIONS.manage,
      label: "Manage organization settings",
      description: "Edit company profile, logo and regional settings.",
      group: "Organization",
    },
  ],
};
