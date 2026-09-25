import type { CallOutcomeCategory, FollowUpType } from "@/generated/prisma/enums";

/** Organization settings namespace of calls & follow-ups (rule T6). */
export const ACTIVITY_SETTINGS_NAMESPACE = "activities";

/** Lead timeline entry types written by this module (PRD §22). */
export const ACTIVITY_TYPES = {
  CALL_LOGGED: "CALL_LOGGED",
  CALL_RECORDING_ADDED: "CALL_RECORDING_ADDED",
  FOLLOW_UP_SCHEDULED: "FOLLOW_UP_SCHEDULED",
  FOLLOW_UP_COMPLETED: "FOLLOW_UP_COMPLETED",
  FOLLOW_UP_RESCHEDULED: "FOLLOW_UP_RESCHEDULED",
  FOLLOW_UP_CANCELLED: "FOLLOW_UP_CANCELLED",
  FOLLOW_UP_MISSED: "FOLLOW_UP_MISSED",
  FOLLOW_UP_TRANSFERRED: "FOLLOW_UP_TRANSFERRED",
} as const;

export const ACTIVITY_JOBS = {
  detectMissed: "activities.follow-ups.detect-missed",
} as const;

export const CALL_RECORDING_PURPOSE = "call.recording";
export const RECORDING_MAX_BYTES = 50 * 1024 * 1024;
/** Any audio format phones and dialers produce (mp3, m4a, aac, amr, wav, ogg…). */
export const RECORDING_TYPES = ["audio/*"];

export const CALL_DIRECTIONS = [
  { value: "OUTBOUND", label: "Outgoing" },
  { value: "INBOUND", label: "Incoming" },
] as const;

export const FOLLOW_UP_TYPES: { value: FollowUpType; label: string }[] = [
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CALLBACK", label: "Callback" },
];

export const OUTCOME_CATEGORIES: { value: CallOutcomeCategory; label: string }[] = [
  { value: "POSITIVE", label: "Positive" },
  { value: "INTERESTED", label: "Interested" },
  { value: "CALLBACK", label: "Callback" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "NEGATIVE", label: "Negative" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "UNRESPONSIVE", label: "Unresponsive" },
];

export const FOLLOW_UP_STATUSES = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "MISSED", label: "Missed" },
  { value: "COMPLETED", label: "Done" },
  { value: "RESCHEDULED", label: "Rescheduled" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

/** Follow-ups that still have to be done (a missed one stays open until it is done, moved or cancelled). */
export const OPEN_FOLLOW_UP_STATUSES = ["SCHEDULED", "MISSED"] as const;

/** Seeded call outcomes (M07-02, PRD §8); organizations can rename, add and deactivate them. */
export const DEFAULT_CALL_OUTCOMES: {
  key: string;
  label: string;
  category: CallOutcomeCategory;
  connected: boolean;
  suggestedStatusKey: string | null;
  requiresNextAction: boolean;
  nextActionType: FollowUpType | null;
}[] = [
  {
    key: "INTERESTED",
    label: "Interested",
    category: "INTERESTED",
    connected: true,
    suggestedStatusKey: "POSITIVE",
    requiresNextAction: true,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "POSITIVE",
    label: "Positive discussion",
    category: "POSITIVE",
    connected: true,
    suggestedStatusKey: "POSITIVE",
    requiresNextAction: true,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "CALLBACK",
    label: "Callback requested",
    category: "CALLBACK",
    connected: true,
    suggestedStatusKey: "CALLBACK",
    requiresNextAction: true,
    nextActionType: "CALLBACK",
  },
  {
    key: "SPOKE",
    label: "Spoke, no decision yet",
    category: "NEUTRAL",
    connected: true,
    suggestedStatusKey: null,
    requiresNextAction: true,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "NEGATIVE",
    label: "Negative response",
    category: "NEGATIVE",
    connected: true,
    suggestedStatusKey: "NEGATIVE",
    requiresNextAction: false,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "NOT_INTERESTED",
    label: "Not interested",
    category: "NOT_INTERESTED",
    connected: true,
    suggestedStatusKey: "NOT_INTERESTED",
    requiresNextAction: false,
    nextActionType: null,
  },
  {
    key: "NO_ANSWER",
    label: "No answer",
    category: "UNRESPONSIVE",
    connected: false,
    suggestedStatusKey: null,
    requiresNextAction: false,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "BUSY",
    label: "Busy",
    category: "UNRESPONSIVE",
    connected: false,
    suggestedStatusKey: null,
    requiresNextAction: false,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "SWITCHED_OFF",
    label: "Switched off",
    category: "UNRESPONSIVE",
    connected: false,
    suggestedStatusKey: null,
    requiresNextAction: false,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "NOT_REACHABLE",
    label: "Not reachable",
    category: "UNRESPONSIVE",
    connected: false,
    suggestedStatusKey: null,
    requiresNextAction: false,
    nextActionType: "FOLLOW_UP",
  },
  {
    key: "WRONG_NUMBER",
    label: "Wrong number",
    category: "NEUTRAL",
    connected: false,
    suggestedStatusKey: "INVALID",
    requiresNextAction: false,
    nextActionType: null,
  },
];

export const DEFAULT_FOLLOW_UP_PURPOSES = [
  "Share project details",
  "Understand requirement",
  "Discuss price & offers",
  "Plan a site visit",
  "Collect documents",
  "General follow-up",
];
