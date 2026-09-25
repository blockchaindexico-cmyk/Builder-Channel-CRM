import { Building, Building2, Layers } from "lucide-react";

import type { ModuleManifest } from "@/platform/registry/types";

import { CATALOG_PERMISSIONS } from "./permissions";

/** M03 — builders, projects and their master data (PRD §4, §26, §27). */
export const catalogManifest: ModuleManifest = {
  key: "catalog",
  planId: "M03",
  name: "Builders & projects",
  nav: [
    {
      key: "catalog.projects",
      label: "Projects",
      href: "/projects",
      icon: Building,
      section: "workspace",
      order: 50,
      permission: CATALOG_PERMISSIONS.projectsView,
    },
    {
      key: "catalog.builders",
      label: "Builders",
      href: "/builders",
      icon: Building2,
      section: "workspace",
      order: 60,
      permission: CATALOG_PERMISSIONS.buildersView,
    },
  ],
  settings: [
    {
      key: "catalog.masters",
      label: "Project catalogue",
      description: "Property types, unit configurations and amenities used on projects and leads.",
      href: "/settings/catalog/property-types",
      icon: Layers,
      group: "Sales setup",
      order: 10,
      permission: CATALOG_PERMISSIONS.projectsManage,
    },
  ],
  permissions: [
    {
      key: CATALOG_PERMISSIONS.buildersView,
      label: "View builders",
      description: "Browse builders, their contacts and projects.",
      group: "Builders & projects",
      defaults: { manager: true, executive: true },
    },
    {
      key: CATALOG_PERMISSIONS.buildersManage,
      label: "Manage builders",
      description:
        "Add and edit builders and contacts, upload builder documents, deactivate builders.",
      group: "Builders & projects",
    },
    {
      key: CATALOG_PERMISSIONS.projectsView,
      label: "View projects",
      description: "Browse projects, pricing and amenities; download shared project documents.",
      group: "Builders & projects",
      defaults: { manager: true, executive: true },
    },
    {
      key: CATALOG_PERMISSIONS.projectsManage,
      label: "Manage projects",
      description:
        "Add and edit projects, change status, maintain property types, configurations and amenities.",
      group: "Builders & projects",
    },
    {
      key: CATALOG_PERMISSIONS.projectFilesManage,
      label: "Manage project documents",
      description: "Upload, remove and see internal project documents and images.",
      group: "Builders & projects",
    },
  ],
};
