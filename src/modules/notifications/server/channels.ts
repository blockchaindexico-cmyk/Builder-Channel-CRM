import type { NotificationSettings } from "../schemas";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelValue,
  type NotificationTypeDefinition,
} from "../types";

type TypeRules = Pick<NotificationTypeDefinition, "key" | "defaultChannels" | "critical">;

/** The organization's default channels for a type and whether it is sent at all (M06-08). */
export function organizationChannels(
  type: TypeRules,
  settings: Pick<NotificationSettings, "types">,
): { enabled: boolean; channels: NotificationChannelValue[] } {
  const override = settings.types[type.key];
  const channels = override?.channels ?? type.defaultChannels;
  // Critical types cannot be switched off, only moved to other channels.
  if (type.critical) {
    return { enabled: true, channels: channels.length ? channels : type.defaultChannels };
  }
  return { enabled: override?.enabled ?? true, channels };
}

/**
 * Channels one notification goes to for one person: the organization's settings first, then the person's own
 * choices (M06-03, M06-07). A critical type always reaches the person somewhere — in the app when every channel
 * was switched off.
 */
export function resolveChannels(
  type: TypeRules,
  settings: Pick<NotificationSettings, "types">,
  preferences: ReadonlyMap<NotificationChannelValue, boolean> | undefined,
): NotificationChannelValue[] {
  const organization = organizationChannels(type, settings);
  if (!organization.enabled) return [];
  const channels = NOTIFICATION_CHANNELS.map((channel) => channel.value).filter(
    (channel) => preferences?.get(channel) ?? organization.channels.includes(channel),
  );
  if (channels.length === 0 && type.critical) return ["IN_APP"];
  return channels;
}
