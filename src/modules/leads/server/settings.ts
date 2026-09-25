import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { getModuleSettings, setModuleSettings } from "@/platform/settings/module-settings";
import type { ServiceContext } from "@/platform/tenant/context";

import { LEAD_PERMISSIONS } from "../permissions";
import { type LeadSettings, leadSettingsSchema } from "../schemas";

const NAMESPACE = "leads";

export function getLeadSettings(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
): Promise<LeadSettings> {
  return getModuleSettings(db, ctx, NAMESPACE, leadSettingsSchema);
}

/** Duplicate policy etc. (M04-03, M04-16). */
export async function updateLeadSettings(
  ctx: ServiceContext,
  input: Partial<LeadSettings>,
): Promise<LeadSettings> {
  ctx.permissions.assert(LEAD_PERMISSIONS.mastersManage);
  return ctx.db.$transaction(async (tx) => {
    const before = await getLeadSettings(tx, ctx);
    const after = await setModuleSettings(tx, ctx, NAMESPACE, leadSettingsSchema, {
      ...before,
      ...input,
    });
    await recordAudit(tx, ctx, {
      action: "leads.settings.update",
      entityType: "OrganizationSetting",
      entityId: ctx.organizationId,
      summary: "Updated lead settings",
      before,
      after,
    });
    return after;
  });
}
