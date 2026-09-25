import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { ValidationError } from "@/platform/errors";
import { getModuleSettings, setModuleSettings } from "@/platform/settings/module-settings";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { NOTIFICATION_SETTINGS_NAMESPACE } from "../constants";
import { NOTIFICATION_PERMISSIONS } from "../permissions";
import { type NotificationSettings, notificationSettingsSchema } from "../schemas";
import { getNotificationType } from "./registry";

/** Which types are sent and how, reminder lead time and the daily summary (M06-08). */
export function getNotificationSettings(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
): Promise<NotificationSettings> {
  return getModuleSettings(db, ctx, NOTIFICATION_SETTINGS_NAMESPACE, notificationSettingsSchema);
}

export async function updateNotificationSettings(
  ctx: ServiceContext,
  input: unknown,
): Promise<NotificationSettings> {
  ctx.permissions.assert(NOTIFICATION_PERMISSIONS.settingsManage);
  const values = parseInput(notificationSettingsSchema, input);
  for (const [key, override] of Object.entries(values.types)) {
    const type = getNotificationType(key);
    if (!type) {
      throw new ValidationError(`Unknown notification type "${key}".`, { types: ["Unknown type"] });
    }
    if (type.critical && (!override.enabled || override.channels.length === 0)) {
      throw new ValidationError(`"${type.label}" is essential and must stay on.`, {
        types: [`"${type.label}" needs at least one channel`],
      });
    }
  }
  return ctx.db.$transaction(async (tx) => {
    const before = await getNotificationSettings(tx, ctx);
    const after = await setModuleSettings(
      tx,
      ctx,
      NOTIFICATION_SETTINGS_NAMESPACE,
      notificationSettingsSchema,
      values,
    );
    await recordAudit(tx, ctx, {
      action: "notifications.settings.update",
      entityType: "OrganizationSetting",
      entityId: ctx.organizationId,
      summary: "Updated notification settings",
      before,
      after,
    });
    return after;
  });
}
