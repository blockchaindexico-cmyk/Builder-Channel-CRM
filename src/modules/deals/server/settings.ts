import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { getModuleSettings, setModuleSettings } from "@/platform/settings/module-settings";
import type { ServiceContext } from "@/platform/tenant/context";

import { DEAL_SETTINGS_NAMESPACE } from "../constants";
import { DEAL_PERMISSIONS } from "../permissions";
import { type DealSettings, dealSettingsSchema } from "../schemas";

/** Visit reminder lead time, transfer on reassignment, outcome due time (M08-02). */
export function getDealSettings(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
): Promise<DealSettings> {
  return getModuleSettings(db, ctx, DEAL_SETTINGS_NAMESPACE, dealSettingsSchema);
}

export async function updateDealSettings(
  ctx: ServiceContext,
  input: Partial<DealSettings>,
): Promise<DealSettings> {
  ctx.permissions.assert(DEAL_PERMISSIONS.mastersManage);
  return ctx.db.$transaction(async (tx) => {
    const before = await getDealSettings(tx, ctx);
    const after = await setModuleSettings(tx, ctx, DEAL_SETTINGS_NAMESPACE, dealSettingsSchema, {
      ...before,
      ...input,
    });
    await recordAudit(tx, ctx, {
      action: "deals.settings.update",
      entityType: "OrganizationSetting",
      entityId: ctx.organizationId,
      summary: "Updated visit and booking settings",
      before,
      after,
    });
    return after;
  });
}
