/** Organization settings namespace of the notifications module (rule T6). */
export const NOTIFICATION_SETTINGS_NAMESPACE = "notifications";

export const NOTIFICATION_JOBS = {
  deliverEmail: "notifications.deliver-email",
  fireReminder: "notifications.reminder.fire",
  publishAnnouncement: "notifications.announcement.publish",
  sweep: "notifications.sweep",
  alerts: "notifications.alerts",
  digest: "notifications.digest",
} as const;

/** Type key of reminders scheduled through `scheduleReminder` unless the caller names another one. */
export const REMINDER_TYPE = "reminder";

/** Grouped notifications (e.g. one bulk assignment) wait this long before e-mailing, so the count settles. */
export const GROUPED_EMAIL_DELAY_SECONDS = 45;

/** Manager alerts are evaluated hourly but only sent during these local hours (organization time zone). */
export const ALERT_HOURS = { from: "09:00", until: "20:00" } as const;

/** The daily summary goes out at the configured time or within this many minutes after it. */
export const DIGEST_WINDOW_MINUTES = 180;

/** Window event fired after notifications were marked read or unread, so the bell refreshes its count. */
export const NOTIFICATIONS_CHANGED_EVENT = "crm:notifications-changed";

export const NOTIFICATION_CATEGORIES = ["Leads", "Team", "Reminders", "System"] as const;

export const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
] as const;

export const AUDIENCE_OPTIONS = [
  { value: "ALL", label: "Everyone" },
  { value: "ROLES", label: "Some roles" },
  { value: "TEAM", label: "A manager's team" },
] as const;
