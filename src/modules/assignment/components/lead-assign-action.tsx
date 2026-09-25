import type { LeadActionTarget } from "@/modules/leads";
import { isWithinScope } from "@/platform/rbac/scope";
import { getRequestContext } from "@/platform/tenant/request-context";

import { ASSIGNMENT_PERMISSIONS } from "../permissions";
import { assignmentScope } from "../server/core";
import { AssignDialog } from "./assign-dialog";

/** "Assign" / "Reassign" in the lead page header, for people allowed to change this lead's owner (M05-04). */
export async function LeadAssignAction({ lead }: { lead: LeadActionTarget }) {
  const ctx = await getRequestContext();
  const scope = await assignmentScope(
    ctx,
    lead.ownerId ? ASSIGNMENT_PERMISSIONS.reassign : ASSIGNMENT_PERMISSIONS.assign,
  );
  if (!scope) return null;
  if (lead.ownerId && !isWithinScope(scope, lead.ownerId)) return null;
  return (
    <AssignDialog
      lead={{ id: lead.id, number: lead.number, ownerId: lead.ownerId, ownerName: lead.ownerName }}
    />
  );
}
