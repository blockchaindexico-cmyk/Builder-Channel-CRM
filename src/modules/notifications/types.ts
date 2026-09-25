/**
 * Notification types (M06-02). Modules declare the kinds of notifications they send in their manifest
 * (`contributions["notification.type"]`); the engine applies the organization's settings and each person's
 * preferences before anything is sent.
 */
export const NOTIFICATION_CHANNELS = [
  { value: "IN_APP", label: "In the app" },
  { value: "EMAIL", label: "E-mail" },
] as const;
export type NotificationChannelValue = (typeof NOTIFICATION_CHANNELS)[number]["value"];

export interface NotificationTypeDefinition {
  key: string;
  label: string;
  description: string;
  category: "Leads" | "Team" | "Reminders" | "System";
  defaultChannels: NotificationChannelValue[];
  /** People may choose the channel but cannot switch the type off completely. */
  critical?: boolean;
  /**
   * Only sent to people with a team (someone reports to them) or an organization-wide view of leads; hidden from
   * everyone else's preferences.
   */
  forManagers?: boolean;
  /** Label of the button in the e-mail (default "Open in the CRM"). */
  emailAction?: string;
}

declare module "@/platform/registry/types" {
  interface ContributionMap {
    "notification.type": NotificationTypeDefinition;
  }
}
