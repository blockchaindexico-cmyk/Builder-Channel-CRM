import {
  buildServerRegistry,
  type ServerModule,
  type ServerRegistry,
} from "@/platform/registry/server";
import { platformServerModule } from "@/platform/server-module";

import { assignmentServerModule } from "./assignment/server";
import { catalogServerModule } from "./catalog/server";
import { identityServerModule } from "./identity/server";
import { leadsServerModule } from "./leads/server";
import { organizationServerModule } from "./organization/server";

/**
 * Composition root for server-side module contributions (jobs, event handlers, file purposes).
 * Used by the web app (to enqueue/dispatch) and by the worker (to process).
 */
export const serverModules: readonly ServerModule[] = [
  platformServerModule,
  organizationServerModule,
  identityServerModule,
  catalogServerModule,
  leadsServerModule,
  assignmentServerModule,
];

let registry: ServerRegistry | undefined;

export function getServerRegistry(): ServerRegistry {
  registry ??= buildServerRegistry(serverModules);
  return registry;
}

/** Test helper: replace the registry (e.g. to add test-only jobs or handlers). Pass undefined to reset. */
export function setServerRegistryForTesting(testRegistry: ServerRegistry | undefined): void {
  registry = testRegistry;
}
