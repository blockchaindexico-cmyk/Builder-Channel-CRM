import "server-only";

import { getCatalogOptions, listBuilderOptions, listProjectOptions } from "@/modules/catalog";
import type { ServiceContext } from "@/platform/tenant/context";

import { LEAD_PERMISSIONS } from "../permissions";
import { getLeadFormOptions, listLeadStatuses } from "./masters";
import { getLeadSettings } from "./settings";

/** Options for the lead form (create/edit). */
export async function loadLeadFormOptions(ctx: ServiceContext, includeProjectIds: string[] = []) {
  const [form, catalog, projects, settings] = await Promise.all([
    getLeadFormOptions(ctx),
    ctx.permissions.has("projects.view")
      ? getCatalogOptions(ctx)
      : Promise.resolve({ propertyTypes: [], configurationTypes: [], amenities: [] }),
    listProjectOptions(ctx, { includeIds: includeProjectIds }),
    getLeadSettings(ctx.db, ctx),
  ]);
  return {
    sources: form.sources,
    campaigns: form.campaigns,
    propertyTypes: catalog.propertyTypes,
    configurationTypes: catalog.configurationTypes,
    projects,
    duplicatePolicy: settings.duplicatePolicy,
  };
}

/** Filter choices for the lead list that come from other modules. */
export async function loadCatalogFilterOptions(ctx: ServiceContext) {
  const [projects, builders] = await Promise.all([
    listProjectOptions(ctx),
    ctx.permissions.hasAny(["projects.view", "builders.view"])
      ? listBuilderOptions(ctx, { includeInactive: true })
      : [],
  ]);
  return { projects, builders };
}

export function statusPermissions(ctx: ServiceContext) {
  return {
    canReopen: ctx.permissions.has(LEAD_PERMISSIONS.reopen),
    canOverride: ctx.permissions.has(LEAD_PERMISSIONS.statusOverride),
  };
}

export { listLeadStatuses };
