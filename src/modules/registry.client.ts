import { buildClientUiRegistry, type ClientUiModule } from "@/platform/registry/client-ui";

import { assignmentClientUi } from "./assignment/client-ui";
import { dealsClientUi } from "./deals/client-ui";

/**
 * Composition root for client components contributed to other modules' client components (bulk actions…).
 * Imported only by client components.
 */
export const clientUiModules: readonly ClientUiModule[] = [assignmentClientUi, dealsClientUi];

export const clientUiRegistry = buildClientUiRegistry(clientUiModules);
