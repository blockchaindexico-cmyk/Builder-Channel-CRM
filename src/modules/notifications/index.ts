/** Public API of the notifications & reminders engine (M06). Other modules import only from here. */

export type {
  AlertCandidate,
  AlertRule,
  DigestBlock,
  DigestLine,
  DigestSection,
} from "./extensions";
export { notificationsManifest } from "./manifest";
export { NOTIFICATION_PERMISSIONS } from "./permissions";
export {
  type NotificationText,
  notify,
  type NotifyInput,
  type NotifyResult,
} from "./server/notify";
export { cancelReminder, type ReminderInput, scheduleReminder } from "./server/reminders";
export { getNotificationSettings } from "./server/settings";
export type { NotificationChannelValue, NotificationTypeDefinition } from "./types";
