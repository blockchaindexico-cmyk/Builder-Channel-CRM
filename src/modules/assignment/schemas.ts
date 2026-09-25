import { z } from "zod";

import { MAX_BULK_LEADS, MIN_REASON_LENGTH } from "./constants";

const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const reason = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((value) => value || null);

/** Assign or reassign one lead (M05-02, M05-03). `expectedOwnerId` is the owner the person saw (concurrency). */
export const assignLeadSchema = z.object({
  leadId: z.uuid(),
  assigneeId: z.uuid("Choose who gets the lead"),
  expectedOwnerId: z.uuid().nullable(),
  reason,
  reasonId: optionalUuid,
});
export type AssignLeadInput = z.input<typeof assignLeadSchema>;

export const unassignLeadSchema = z.object({
  leadId: z.uuid(),
  expectedOwnerId: z.uuid(),
  reason,
  reasonId: optionalUuid,
});
export type UnassignLeadInput = z.input<typeof unassignLeadSchema>;

/** Bulk (M05-05): one member gets all leads, several members share them in turn. */
export const bulkAssignSchema = z.object({
  leadIds: z.array(z.uuid()).min(1, "Select leads").max(MAX_BULK_LEADS),
  assigneeIds: z.array(z.uuid()).min(1, "Choose who gets the leads").max(50),
  reason,
  reasonId: optionalUuid,
});
export type BulkAssignInput = z.input<typeof bulkAssignSchema>;

export const assignmentSettingsSchema = z.object({
  /** Leads created by an executive (who sees only their own leads) are assigned to them. */
  assignCreator: z.boolean().default(true),
  /** A lead is "unworked" when nothing happened this many hours after it was assigned (Q-08). */
  unworkedHours: z.number().int().min(1).max(720).default(24),
});
export type AssignmentSettings = z.output<typeof assignmentSettingsSchema>;

export const reassignmentReasonSchema = z.object({
  label: z.string().trim().min(2, "Enter a reason").max(80),
  isActive: z.boolean().default(true),
});

export const assignmentRuleSchema = z.object({
  name: z.string().trim().min(2, "Name the rule").max(80),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
  channels: z
    .array(z.enum(["MANUAL", "IMPORT", "API"]))
    .max(3)
    .default([]),
  sourceIds: z.array(z.uuid()).max(50).default([]),
  campaignIds: z.array(z.uuid()).max(50).default([]),
  projectIds: z.array(z.uuid()).max(50).default([]),
  strategy: z.enum(["ROUND_ROBIN", "LEAST_LOADED"]).default("ROUND_ROBIN"),
  memberIds: z.array(z.uuid()).min(1, "Choose at least one member").max(50),
});
export type AssignmentRuleInput = z.input<typeof assignmentRuleSchema>;

/** "Reassign & deactivate" (M05-09). No assignees = the open leads go back to the unassigned queue. */
export const deactivationHandoverSchema = z.object({
  membershipId: z.uuid(),
  assigneeIds: z.array(z.uuid()).max(50).default([]),
  reason: z
    .string()
    .trim()
    .min(MIN_REASON_LENGTH, `Give a reason (at least ${MIN_REASON_LENGTH} characters)`)
    .max(500),
});
export type DeactivationHandoverInput = z.input<typeof deactivationHandoverSchema>;
