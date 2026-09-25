/** Reason categories seeded for every organization (editable in Settings → Lead assignment). */
export const DEFAULT_REASSIGNMENT_REASONS = [
  "Workload balancing",
  "Executive on leave",
  "Executive left the company",
  "Customer asked for someone else",
  "Language or location match",
  "Lead not being worked",
  "Other",
] as const;

/** Timeline entry types written by M05. */
export const ASSIGNMENT_ACTIVITY_TYPES = {
  ASSIGNED: "ASSIGNED",
  REASSIGNED: "REASSIGNED",
  UNASSIGNED: "UNASSIGNED",
} as const;

export const ASSIGNMENT_METHODS = [
  { value: "MANUAL", label: "By hand" },
  { value: "BULK", label: "Bulk assignment" },
  { value: "CREATOR", label: "Created by the owner" },
  { value: "IMPORT", label: "Import" },
  { value: "RULE", label: "Assignment rule" },
  { value: "DEACTIVATION", label: "Owner deactivated" },
  { value: "BACKFILL", label: "Owner before assignment history" },
] as const;

export const ASSIGNMENT_STRATEGIES = [
  {
    value: "ROUND_ROBIN",
    label: "Round robin",
    description: "Members take turns, in the order listed.",
  },
  {
    value: "LEAST_LOADED",
    label: "Least loaded",
    description: "The member with the fewest open leads gets the next one.",
  },
] as const;

export const LEAD_CHANNELS = [
  { value: "MANUAL", label: "Entered by hand" },
  { value: "IMPORT", label: "Import" },
  { value: "API", label: "Intake API" },
] as const;

/** A reassignment reason must say something ("moved" is not a reason). */
export const MIN_REASON_LENGTH = 5;
export const MAX_BULK_LEADS = 500;
