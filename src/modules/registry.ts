import { composeRegistry } from "@/platform/registry/compose";
import type { ModuleManifest } from "@/platform/registry/types";

import { coreManifest } from "./core/manifest";
import { organizationManifest } from "./organization/manifest";

/**
 * Composition root for client-safe module manifests (M01-21). Add each module here as it is built
 * (M02 identity, M03 catalog, M04 leads, ...). Order does not matter; items sort by their `order`.
 */
export const moduleManifests: readonly ModuleManifest[] = [coreManifest, organizationManifest];

export const appRegistry = composeRegistry(moduleManifests);
