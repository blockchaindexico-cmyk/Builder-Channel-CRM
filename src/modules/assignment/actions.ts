"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { tenantAction } from "@/platform/actions/client";

import { ASSIGNMENT_PERMISSIONS } from "./permissions";
import {
  assignLeadSchema,
  assignmentRuleSchema,
  assignmentSettingsSchema,
  bulkAssignSchema,
  deactivationHandoverSchema,
  reassignmentReasonSchema,
  unassignLeadSchema,
} from "./schemas";
import * as assign from "./server/assign";
import * as handover from "./server/handover";
import * as reasons from "./server/reasons";
import * as rules from "./server/rules";
import * as settings from "./server/settings";

const refreshLeads = (leadId?: string) => {
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads", "layout");
  revalidatePath("/team/workload");
};

// --- Assigning (M05-02 → M05-05) ---------------------------------------------------------------------------------

/** People and reasons for the assign dialogs, loaded when a dialog opens. */
export const assignOptionsAction = tenantAction
  .metadata({ name: "assignment.options" })
  .inputSchema(z.object({ purpose: z.enum(["assign", "reassign"]) }))
  .action(async ({ parsedInput, ctx }) => {
    const permission =
      parsedInput.purpose === "assign"
        ? ASSIGNMENT_PERMISSIONS.assign
        : ASSIGNMENT_PERMISSIONS.reassign;
    const [members, reasonRows] = await Promise.all([
      assign.listAssignableMembers(ctx.service, permission),
      reasons.listReassignmentReasons(ctx.service, { activeOnly: true }),
    ]);
    return { members, reasons: reasonRows.map(({ id, label }) => ({ id, label })) };
  });

export const assignLeadAction = tenantAction
  .metadata({ name: "assignment.assign" })
  .inputSchema(assignLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await assign.assignLead(ctx.service, parsedInput);
    refreshLeads(parsedInput.leadId);
    return result;
  });

export const unassignLeadAction = tenantAction
  .metadata({ name: "assignment.unassign", permission: ASSIGNMENT_PERMISSIONS.reassign })
  .inputSchema(unassignLeadSchema)
  .action(async ({ parsedInput, ctx }) => {
    await assign.unassignLead(ctx.service, parsedInput);
    refreshLeads(parsedInput.leadId);
  });

export const bulkAssignAction = tenantAction
  .metadata({ name: "assignment.bulk" })
  .inputSchema(bulkAssignSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await assign.bulkAssign(ctx.service, parsedInput);
    refreshLeads();
    return result;
  });

// --- Handover (M05-09) -----------------------------------------------------------------------------------------

export const handOverAndDeactivateAction = tenantAction
  .metadata({ name: "assignment.handover" })
  .inputSchema(deactivationHandoverSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await handover.handOverAndDeactivate(ctx.service, parsedInput);
    refreshLeads();
    revalidatePath("/settings/users", "layout");
    revalidatePath("/team", "layout");
    return result;
  });

// --- Settings (M05-06, M05-08, M05-10) ------------------------------------------------------------------------

export const saveAssignmentRuleAction = tenantAction
  .metadata({ name: "assignment.rules.save", permission: ASSIGNMENT_PERMISSIONS.rulesManage })
  .inputSchema(assignmentRuleSchema.extend({ ruleId: z.uuid().nullable() }))
  .action(async ({ parsedInput: { ruleId, ...values }, ctx }) => {
    const result = await rules.saveAssignmentRule(ctx.service, ruleId, values);
    revalidatePath("/settings/assignment", "layout");
    return result;
  });

export const deleteAssignmentRuleAction = tenantAction
  .metadata({ name: "assignment.rules.delete", permission: ASSIGNMENT_PERMISSIONS.rulesManage })
  .inputSchema(z.object({ ruleId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await rules.deleteAssignmentRule(ctx.service, parsedInput.ruleId);
    revalidatePath("/settings/assignment", "layout");
  });

export const saveReasonAction = tenantAction
  .metadata({ name: "assignment.reasons.save", permission: ASSIGNMENT_PERMISSIONS.rulesManage })
  .inputSchema(reassignmentReasonSchema.extend({ reasonId: z.uuid().nullable() }))
  .action(async ({ parsedInput: { reasonId, ...values }, ctx }) => {
    const result = await reasons.saveReassignmentReason(ctx.service, reasonId, values);
    revalidatePath("/settings/assignment", "layout");
    return result;
  });

export const deleteReasonAction = tenantAction
  .metadata({ name: "assignment.reasons.delete", permission: ASSIGNMENT_PERMISSIONS.rulesManage })
  .inputSchema(z.object({ reasonId: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await reasons.deleteReassignmentReason(ctx.service, parsedInput.reasonId);
    revalidatePath("/settings/assignment", "layout");
  });

export const saveAssignmentSettingsAction = tenantAction
  .metadata({ name: "assignment.settings", permission: ASSIGNMENT_PERMISSIONS.rulesManage })
  .inputSchema(assignmentSettingsSchema.partial())
  .action(async ({ parsedInput, ctx }) => {
    const result = await settings.updateAssignmentSettings(ctx.service, parsedInput);
    revalidatePath("/settings/assignment", "layout");
    revalidatePath("/team/workload");
    return result;
  });
