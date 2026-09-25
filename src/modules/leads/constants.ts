/** Lead lifecycle defaults (BUILD_PLAN §1.4) and display labels. */

export const LEAD_STATUS_KEYS = {
  NEW: "NEW",
  ASSIGNED: "ASSIGNED",
  CONTACTED: "CONTACTED",
  POSITIVE: "POSITIVE",
  NEGATIVE: "NEGATIVE",
  UNRESPONSIVE: "UNRESPONSIVE",
  FOLLOW_UP: "FOLLOW_UP",
  CALLBACK: "CALLBACK",
  VISIT: "VISIT",
  REVISIT: "REVISIT",
  BOOKING: "BOOKING",
  CLOSED_WON: "CLOSED_WON",
  NOT_INTERESTED: "NOT_INTERESTED",
  LOST: "LOST",
  INVALID: "INVALID",
} as const;
export type LeadStatusKey = (typeof LEAD_STATUS_KEYS)[keyof typeof LEAD_STATUS_KEYS];

export type StatusCategory = "OPEN" | "ACTIVE" | "BOOKING" | "WON" | "LOST" | "INVALID";

export const DEFAULT_LEAD_STATUSES: {
  key: LeadStatusKey;
  label: string;
  category: StatusCategory;
  color: string;
  isTerminal: boolean;
  requiresReason: boolean;
}[] = [
  {
    key: "NEW",
    label: "New / Open",
    category: "OPEN",
    color: "#3b82f6",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "ASSIGNED",
    label: "Assigned",
    category: "OPEN",
    color: "#6366f1",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "CONTACTED",
    label: "Contacted",
    category: "ACTIVE",
    color: "#0ea5e9",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "POSITIVE",
    label: "Positive",
    category: "ACTIVE",
    color: "#22c55e",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "NEGATIVE",
    label: "Negative",
    category: "ACTIVE",
    color: "#f97316",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "UNRESPONSIVE",
    label: "Unresponsive",
    category: "ACTIVE",
    color: "#a855f7",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "FOLLOW_UP",
    label: "Follow-up",
    category: "ACTIVE",
    color: "#eab308",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "CALLBACK",
    label: "Callback",
    category: "ACTIVE",
    color: "#f59e0b",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "VISIT",
    label: "Visit",
    category: "ACTIVE",
    color: "#14b8a6",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "REVISIT",
    label: "Revisit",
    category: "ACTIVE",
    color: "#0d9488",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "BOOKING",
    label: "Booking",
    category: "BOOKING",
    color: "#8b5cf6",
    isTerminal: false,
    requiresReason: false,
  },
  {
    key: "CLOSED_WON",
    label: "Closed / Won",
    category: "WON",
    color: "#16a34a",
    isTerminal: true,
    requiresReason: false,
  },
  {
    key: "NOT_INTERESTED",
    label: "Not Interested",
    category: "LOST",
    color: "#94a3b8",
    isTerminal: true,
    requiresReason: true,
  },
  {
    key: "LOST",
    label: "Lost",
    category: "LOST",
    color: "#ef4444",
    isTerminal: true,
    requiresReason: true,
  },
  {
    key: "INVALID",
    label: "Invalid / Duplicate",
    category: "INVALID",
    color: "#64748b",
    isTerminal: true,
    requiresReason: true,
  },
];

/**
 * Statuses driven by workflows (creation, assignment, visits, bookings). Setting them by hand needs
 * `leads.status_override`; their modules set them through their own services.
 */
export const SYSTEM_DRIVEN_STATUS_KEYS: readonly string[] = [
  "NEW",
  "ASSIGNED",
  "VISIT",
  "REVISIT",
  "BOOKING",
  "CLOSED_WON",
];

export const STATUS_CATEGORIES: { value: StatusCategory; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "ACTIVE", label: "In progress" },
  { value: "BOOKING", label: "Booking" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "INVALID", label: "Invalid" },
];

export const SOURCE_TYPES = [
  { value: "WEBSITE", label: "Website" },
  { value: "PORTAL", label: "Property portal" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "REFERRAL", label: "Referral" },
  { value: "SOCIAL", label: "Social media" },
  { value: "CAMPAIGN", label: "Campaign / ads" },
  { value: "IMPORT", label: "Import" },
  { value: "API", label: "API" },
  { value: "OTHER", label: "Other" },
] as const;
export type SourceTypeValue = (typeof SOURCE_TYPES)[number]["value"];

export const DEFAULT_LEAD_SOURCES: { name: string; code: string; type: SourceTypeValue }[] = [
  { name: "Website", code: "website", type: "WEBSITE" },
  { name: "99acres", code: "99acres", type: "PORTAL" },
  { name: "MagicBricks", code: "magicbricks", type: "PORTAL" },
  { name: "Housing.com", code: "housing", type: "PORTAL" },
  { name: "Walk-in", code: "walk-in", type: "WALK_IN" },
  { name: "Referral", code: "referral", type: "REFERRAL" },
  { name: "Facebook / Instagram", code: "social", type: "SOCIAL" },
  { name: "Google Ads", code: "google-ads", type: "CAMPAIGN" },
  { name: "Import", code: "import", type: "IMPORT" },
  { name: "API", code: "api", type: "API" },
  { name: "Other", code: "other", type: "OTHER" },
];

export const TEMPERATURES = [
  { value: "HOT", label: "Hot", tone: "destructive" },
  { value: "WARM", label: "Warm", tone: "warning" },
  { value: "COLD", label: "Cold", tone: "info" },
] as const;
export type TemperatureValue = (typeof TEMPERATURES)[number]["value"];

export const PURPOSES = [
  { value: "END_USE", label: "End use" },
  { value: "INVESTMENT", label: "Investment" },
] as const;

export const BUYING_TIMELINES = [
  { value: "IMMEDIATE", label: "Immediately" },
  { value: "WITHIN_3_MONTHS", label: "Within 3 months" },
  { value: "WITHIN_6_MONTHS", label: "Within 6 months" },
  { value: "WITHIN_1_YEAR", label: "Within a year" },
  { value: "LATER", label: "Later / exploring" },
] as const;

export const INTEREST_LEVELS = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export const DUPLICATE_POLICIES = [
  {
    value: "FLAG",
    label: "Flag for review",
    description: "Create the lead, link it to the existing one and put it in the duplicates queue.",
  },
  {
    value: "BLOCK",
    label: "Block",
    description: "Refuse to create a lead whose mobile or e-mail already exists.",
  },
  { value: "ALLOW", label: "Allow", description: "Create it without any check." },
] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number]["value"];

/** Timeline entry types written by M04 (later modules add their own). */
export const LEAD_ACTIVITY_TYPES = {
  CREATED: "CREATED",
  UPDATED: "UPDATED",
  STATUS_CHANGED: "STATUS_CHANGED",
  NOTE_ADDED: "NOTE_ADDED",
  NOTE_UPDATED: "NOTE_UPDATED",
  NOTE_DELETED: "NOTE_DELETED",
  FILE_ADDED: "FILE_ADDED",
  FILE_REMOVED: "FILE_REMOVED",
  DUPLICATE_DETECTED: "DUPLICATE_DETECTED",
  DUPLICATE_RESOLVED: "DUPLICATE_RESOLVED",
  MERGED: "MERGED",
  DELETED: "DELETED",
} as const;
