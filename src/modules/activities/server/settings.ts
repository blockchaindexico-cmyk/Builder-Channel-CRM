import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { getModuleSettings, setModuleSettings } from "@/platform/settings/module-settings";
import type { ServiceContext } from "@/platform/tenant/context";

import { ACTIVITY_SETTINGS_NAMESPACE } from "../constants";
import { ACTIVITY_PERMISSIONS } from "../permissions";
import { type ActivitySettings, activitySettingsSchema } from "../schemas";

/** Missed grace period, unresponsive threshold, transfer on reassignment, status automation (M07-03). */
export function getActivitySettings(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
): Promise<ActivitySettings> {
  return getModuleSettings(db, ctx, ACTIVITY_SETTINGS_NAMESPACE, activitySettingsSchema);
}

export async function updateActivitySettings(
  ctx: ServiceContext,
  input: Partial<ActivitySettings>,
): Promise<ActivitySettings> {
  ctx.permissions.assert(ACTIVITY_PERMISSIONS.mastersManage);
  return ctx.db.$transaction(async (tx) => {
    const before = await getActivitySettings(tx, ctx);
    const after = await setModuleSettings(
      tx,
      ctx,
      ACTIVITY_SETTINGS_NAMESPACE,
      activitySettingsSchema,
      { ...before, ...input },
    );
    await recordAudit(tx, ctx, {
      action: "activities.settings.update",
      entityType: "OrganizationSetting",
      entityId: ctx.organizationId,
      summary: "Updated call and follow-up settings",
      before,
      after,
    });
    return after;
  });
}
