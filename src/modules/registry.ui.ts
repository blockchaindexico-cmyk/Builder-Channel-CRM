import "server-only";

import { buildUiRegistry, type UiModule } from "@/platform/registry/ui";

import { activitiesUiModule } from "./activities/ui";
import { assignmentUiModule } from "./assignment/ui";
import { dealsUiModule } from "./deals/ui";
import { notificationsUiModule } from "./notifications/ui";

/**
 * Composition root for server-rendered UI contributions (lead page panels, dashboard widgets…). Modules add
 * their `ui.ts` export here as they are built (M05 assignment history, M07 calls, M08 visits…).
 */
export const uiModules: readonly UiModule[] = [
  assignmentUiModule,
  notificationsUiModule,
  activitiesUiModule,
  dealsUiModule,
];

export const uiRegistry = buildUiRegistry(uiModules);
