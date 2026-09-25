import { composeRegistry } from "@/platform/registry/compose";
import type { ModuleManifest } from "@/platform/registry/types";

import { activitiesManifest } from "./activities/manifest";
import { assignmentManifest } from "./assignment/manifest";
import { catalogManifest } from "./catalog/manifest";
import { coreManifest } from "./core/manifest";
import { identityManifest } from "./identity/manifest";
import { leadsManifest } from "./leads/manifest";
import { notificationsManifest } from "./notifications/manifest";
import { organizationManifest } from "./organization/manifest";

/**
 * Composition root for client-safe module manifests (M01-21). Add each module here as it is built
 * (M02 identity, M03 catalog, M04 leads, ...). Order does not matter; items sort by their `order`.
 */
export const moduleManifests: readonly ModuleManifest[] = [
  coreManifest,
  organizationManifest,
  identityManifest,
  catalogManifest,
  leadsManifest,
  assignmentManifest,
  notificationsManifest,
  activitiesManifest,
];

export const appRegistry = composeRegistry(moduleManifests);
