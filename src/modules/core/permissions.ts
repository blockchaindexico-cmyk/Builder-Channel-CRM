export const CORE_PERMISSIONS = {
  /** Open the settings area (any settings section additionally checks its own permission). */
  settingsAccess: "settings.access",
  /** View system status: health checks and the domain-event log. */
  systemStatus: "system.status.view",
} as const;
