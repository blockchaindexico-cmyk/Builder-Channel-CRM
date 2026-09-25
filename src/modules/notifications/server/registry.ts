import { appRegistry } from "@/modules/registry";

import type { NotificationTypeDefinition } from "../types";

/** Notification types declared by the modules' manifests (M06-02). */
export function listNotificationTypes(): readonly NotificationTypeDefinition[] {
  return appRegistry.contributions("notification.type");
}

export function getNotificationType(key: string): NotificationTypeDefinition | undefined {
  return listNotificationTypes().find((type) => type.key === key);
}

export function requireNotificationType(key: string): NotificationTypeDefinition {
  const type = getNotificationType(key);
  if (!type) {
    throw new Error(`Unknown notification type "${key}". Declare it in a module manifest.`);
  }
  return type;
}
