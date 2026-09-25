import { recordAudit } from "@/platform/audit";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import { getModuleSettings, setModuleSettings } from "@/platform/settings/module-settings";
import type { ServiceContext } from "@/platform/tenant/context";

import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import { type AssignmentSettings, assignmentSettingsSchema } from "../schemas";

const NAMESPACE = "assignment";

export function getAssignmentSettings(
  db: TenantDbOrTx,
  ctx: Pick<ServiceContext, "organizationId">,
): Promise<AssignmentSettings> {
  return getModuleSettings(db, ctx, NAMESPACE, assignmentSettingsSchema);
}

/** Creator assignment and the "unworked" threshold (M05-06, M05-08). */
export async function updateAssignmentSettings(
  ctx: ServiceContext,
  input: Partial<AssignmentSettings>,
): Promise<AssignmentSettings> {
  ctx.permissions.assert(ASSIGNMENT_PERMISSIONS.rulesManage);
  return ctx.db.$transaction(async (tx) => {
    const before = await getAssignmentSettings(tx, ctx);
    const after = await setModuleSettings(tx, ctx, NAMESPACE, assignmentSettingsSchema, {
      ...before,
      ...input,
    });
    await recordAudit(tx, ctx, {
      action: "assignment.settings.update",
      entityType: "OrganizationSetting",
      entityId: ctx.organizationId,
      summary: "Updated lead assignment settings",
      before,
      after,
    });
    return after;
  });
}
