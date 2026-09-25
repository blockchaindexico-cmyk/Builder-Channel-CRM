import { ensureCustomRole } from "@/modules/identity";
import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { getModuleSettings, setModuleSettings } from "@/platform/settings/module-settings";
import type { ServiceContext } from "@/platform/tenant/context";
import { parseInput } from "@/platform/validation";

import { ACCOUNTS_ROLE, BILLING_SETTINGS_NAMESPACE } from "../constants";
import { BILLING_PERMISSIONS } from "../permissions";
import { type BillingSettings, billingSettingsSchema } from "../schemas";

/** Seller details, numbering, tax and bank details printed on invoices (M09-02). */
export function getBillingSettings(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
): Promise<BillingSettings> {
  return getModuleSettings(db, ctx, BILLING_SETTINGS_NAMESPACE, billingSettingsSchema);
}

export async function updateBillingSettings(
  ctx: ServiceContext,
  input: Partial<BillingSettings>,
): Promise<BillingSettings> {
  ctx.permissions.assert(BILLING_PERMISSIONS.billingManage);
  return ctx.db.$transaction(async (tx) => {
    const before = await getBillingSettings(tx, ctx);
    const { accountsRoleOffered: _ignored, ...changes } = input;
    const after = parseInput(billingSettingsSchema, { ...before, ...changes });
    await setModuleSettings(tx, ctx, BILLING_SETTINGS_NAMESPACE, billingSettingsSchema, after);
    await recordAudit(tx, ctx, {
      action: "billing.settings.update",
      entityType: "OrganizationSetting",
      entityId: ctx.organizationId,
      summary: "Updated billing settings",
      before,
      after,
    });
    return after;
  });
}

/**
 * Offers the "Accounts" role once per organization (Q-16): finance and billing, all bookings with their values.
 * Deleting it afterwards sticks.
 */
export async function seedBillingMasters(db: TenantDbOrTx, organizationId: string) {
  const ctx = { organizationId };
  const settings = await getBillingSettings(db, ctx);
  if (settings.accountsRoleOffered) return;
  await ensureCustomRole(db, organizationId, {
    ...ACCOUNTS_ROLE,
    grants: [
      ...Object.values(BILLING_PERMISSIONS).map((permission) => ({ permission, scope: null })),
      { permission: "bookings.view", scope: "ALL" },
      { permission: "bookings.view_value", scope: null },
      // Builders and projects, to bill them and filter reports.
      { permission: "builders.view", scope: null },
      { permission: "projects.view", scope: null },
    ],
  });
  await setModuleSettings(db, ctx, BILLING_SETTINGS_NAMESPACE, billingSettingsSchema, {
    ...settings,
    accountsRoleOffered: true,
  });
}
