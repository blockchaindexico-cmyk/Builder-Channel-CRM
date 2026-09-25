import "server-only";

import { buildUiRegistry, type UiModule } from "@/platform/registry/ui";

/**
 * Composition root for server-rendered UI contributions (lead page panels, dashboard widgets…). Modules add
 * their `ui.ts` export here as they are built (M05 assignment history, M07 calls, M08 visits…).
 */
export const uiModules: readonly UiModule[] = [];

export const uiRegistry = buildUiRegistry(uiModules);
