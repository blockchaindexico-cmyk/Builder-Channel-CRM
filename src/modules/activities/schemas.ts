import { z } from "zod";

import { statusDetailsSchema } from "@/modules/leads";

import { RECORDING_MAX_BYTES } from "./constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => value || null);

const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .nullable()
  .optional()
  .transform((value) => value || null);

const followUpType = z.enum(["FOLLOW_UP", "CALLBACK"]);
const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

/** A follow-up or callback to schedule (M07-10). */
export const followUpInputSchema = z.object({
  type: followUpType.default("FOLLOW_UP"),
  dueAt: instant,
  purposeId: optionalUuid,
  notes: optionalText(1000),
});
export type FollowUpInput = z.input<typeof followUpInputSchema>;

export const scheduleFollowUpSchema = followUpInputSchema.extend({ leadId: z.uuid() });
export type ScheduleFollowUpInput = z.input<typeof scheduleFollowUpSchema>;

/**
 * Logging a call with its disposition in one step (M07-04, M07-05). `statusKey`: omitted = the automatic rules
 * decide, null = keep the current status, a key = set that status.
 */
export const logCallSchema = z.object({
  leadId: z.uuid(),
  direction: z.enum(["OUTBOUND", "INBOUND"]).default("OUTBOUND"),
  startedAt: instant.optional(),
  durationSeconds: z.number().int().min(0).max(36_000).default(0),
  outcomeId: z.uuid("Choose how the call went"),
  notes: optionalText(2000),
  statusKey: z.string().trim().min(1).max(40).nullable().optional(),
  statusReason: optionalText(500),
  /** Answers of the status's extra fields (e.g. M08's loss reason). */
  statusDetails: statusDetailsSchema,
  /** Open follow-up or callback this call took care of. */
  completeFollowUpId: optionalUuid,
  next: followUpInputSchema.nullable().optional(),
});
export type LogCallInput = z.input<typeof logCallSchema>;

export const completeFollowUpSchema = z.object({
  followUpId: z.uuid(),
  notes: optionalText(1000),
  next: followUpInputSchema.nullable().optional(),
});
export type CompleteFollowUpInput = z.input<typeof completeFollowUpSchema>;

export const rescheduleFollowUpSchema = z.object({
  followUpId: z.uuid(),
  dueAt: instant,
  notes: optionalText(1000),
});
export type RescheduleFollowUpInput = z.input<typeof rescheduleFollowUpSchema>;

export const cancelFollowUpSchema = z.object({
  followUpId: z.uuid(),
  reason: z.string().trim().min(3, "Say why it is cancelled").max(500),
});
export type CancelFollowUpInput = z.input<typeof cancelFollowUpSchema>;

export const requestRecordingSchema = z.object({
  callId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive().max(RECORDING_MAX_BYTES, "Recordings can be up to 50 MB"),
});

// --- Settings (M07-03) --------------------------------------------------------------------------------------------

export const callOutcomeSchema = z.object({
  label: z.string().trim().min(2, "Name the outcome").max(60),
  category: z.enum([
    "POSITIVE",
    "NEGATIVE",
    "UNRESPONSIVE",
    "CALLBACK",
    "INTERESTED",
    "NOT_INTERESTED",
    "NEUTRAL",
  ]),
  connected: z.boolean(),
  suggestedStatusKey: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((value) => value || null),
  requiresNextAction: z.boolean().default(false),
  nextActionType: followUpType.nullable().optional().default(null),
  isActive: z.boolean().default(true),
});
export type CallOutcomeInput = z.input<typeof callOutcomeSchema>;

export const followUpPurposeSchema = z.object({
  label: z.string().trim().min(2, "Name the purpose").max(60),
  isActive: z.boolean().default(true),
});

export const activitySettingsSchema = z.object({
  /** A follow-up counts as missed this long after its time (Q-08: 2 hours). */
  missedGraceMinutes: z.number().int().min(0).max(10_080).default(120),
  /** Unanswered calls in a row after which "Unresponsive" is suggested (Q-08: 3). */
  unresponsiveAfterAttempts: z.number().int().min(1).max(20).default(3),
  /** Open follow-ups and callbacks move with the lead when it is reassigned. */
  transferOnReassign: z.boolean().default(true),
  /** Calls reported without a person (telephony) apply the suggested status automatically. */
  autoApplyStatus: z.boolean().default(true),
});
export type ActivitySettings = z.output<typeof activitySettingsSchema>;
