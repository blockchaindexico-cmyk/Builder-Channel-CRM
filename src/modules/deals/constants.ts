import type {
  BookingStatus,
  LossReasonScope,
  SiteVisitStatus,
  VisitNextStep,
  VisitOutcomeCategory,
} from "@/generated/prisma/enums";

/** Organization settings namespace of visits & bookings (rule T6). */
export const DEAL_SETTINGS_NAMESPACE = "deals";

/** Lead timeline entry types written by this module (PRD §22). */
export const DEAL_TYPES = {
  VISIT_SCHEDULED: "VISIT_SCHEDULED",
  VISIT_CONFIRMED: "VISIT_CONFIRMED",
  VISIT_COMPLETED: "VISIT_COMPLETED",
  VISIT_NO_SHOW: "VISIT_NO_SHOW",
  VISIT_CANCELLED: "VISIT_CANCELLED",
  VISIT_RESCHEDULED: "VISIT_RESCHEDULED",
  VISITS_TRANSFERRED: "VISITS_TRANSFERRED",
  BOOKING_CREATED: "BOOKING_CREATED",
  BOOKING_UPDATED: "BOOKING_UPDATED",
  BOOKING_STAGE_CHANGED: "BOOKING_STAGE_CHANGED",
  BOOKING_CLOSED: "BOOKING_CLOSED",
  BOOKING_CANCELLED: "BOOKING_CANCELLED",
} as const;

export const BOOKING_DOCUMENT_PURPOSE = "booking.document";
export const BOOKING_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const BOOKING_DOCUMENT_TYPES = [
  "application/pdf",
  "image/*",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const VISIT_STATUSES: { value: SiteVisitStatus; label: string }[] = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "NO_SHOW", label: "No-show" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "RESCHEDULED", label: "Rescheduled" },
];

/** Visits still to happen (or whose outcome is still to be recorded). */
export const OPEN_VISIT_STATUSES = ["SCHEDULED", "CONFIRMED"] as const satisfies SiteVisitStatus[];

export const VISIT_OUTCOME_CATEGORIES: { value: VisitOutcomeCategory; label: string }[] = [
  { value: "BOOKING", label: "Ready to book" },
  { value: "POSITIVE", label: "Positive" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "NEGATIVE", label: "Negative" },
];

export const VISIT_NEXT_STEPS: { value: VisitNextStep; label: string }[] = [
  { value: "BOOKING", label: "Book" },
  { value: "REVISIT", label: "Plan a revisit" },
  { value: "FOLLOW_UP", label: "Follow up" },
  { value: "CLOSE", label: "Close the lead" },
];

export const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "ACTIVE", label: "In progress" },
  { value: "CLOSED_WON", label: "Closed / Won" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const LOSS_REASON_SCOPES: { value: LossReasonScope; label: string }[] = [
  { value: "LOST", label: "Lost" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "BOOKING_CANCELLED", label: "Booking cancelled" },
];

/** Lead statuses whose change needs a loss reason, and the reasons that apply to each. */
export const LOSS_STATUS_SCOPE: Record<string, LossReasonScope> = {
  LOST: "LOST",
  NOT_INTERESTED: "NOT_INTERESTED",
};

/** Seeded visit outcomes (M08-02); organizations can rename, add and deactivate them. */
export const DEFAULT_VISIT_OUTCOMES: {
  key: string;
  label: string;
  category: VisitOutcomeCategory;
  nextStep: VisitNextStep | null;
}[] = [
  {
    key: "WANTS_TO_BOOK",
    label: "Liked it — wants to book",
    category: "BOOKING",
    nextStep: "BOOKING",
  },
  {
    key: "THINKING",
    label: "Liked it — thinking it over",
    category: "POSITIVE",
    nextStep: "FOLLOW_UP",
  },
  {
    key: "REVISIT_WITH_FAMILY",
    label: "Wants to come again with family",
    category: "POSITIVE",
    nextStep: "REVISIT",
  },
  {
    key: "OTHER_OPTIONS",
    label: "Wants to see other options",
    category: "NEUTRAL",
    nextStep: "FOLLOW_UP",
  },
  {
    key: "PRICE_HIGH",
    label: "Found the price too high",
    category: "NEGATIVE",
    nextStep: "FOLLOW_UP",
  },
  { key: "NOT_LIKED", label: "Did not like the project", category: "NEGATIVE", nextStep: "CLOSE" },
];

/** Seeded loss reasons (M08-02, PRD §12, §17). */
export const DEFAULT_LOSS_REASONS: { key: string; label: string; appliesTo: LossReasonScope[] }[] =
  [
    {
      key: "BUDGET",
      label: "Budget mismatch",
      appliesTo: ["LOST", "NOT_INTERESTED", "BOOKING_CANCELLED"],
    },
    { key: "LOCATION", label: "Location not suitable", appliesTo: ["LOST", "NOT_INTERESTED"] },
    {
      key: "BOUGHT_ELSEWHERE",
      label: "Bought elsewhere",
      appliesTo: ["LOST", "BOOKING_CANCELLED"],
    },
    { key: "LOAN", label: "Loan not approved", appliesTo: ["LOST", "BOOKING_CANCELLED"] },
    {
      key: "PLAN_DROPPED",
      label: "Plan postponed or dropped",
      appliesTo: ["LOST", "NOT_INTERESTED", "BOOKING_CANCELLED"],
    },
    {
      key: "PROJECT_CONCERNS",
      label: "Concerns about the project or builder",
      appliesTo: ["LOST", "NOT_INTERESTED", "BOOKING_CANCELLED"],
    },
    { key: "NOT_REACHABLE", label: "Not reachable any more", appliesTo: ["LOST"] },
    { key: "NO_REQUIREMENT", label: "No real requirement", appliesTo: ["NOT_INTERESTED"] },
    { key: "OTHER", label: "Other", appliesTo: ["LOST", "NOT_INTERESTED", "BOOKING_CANCELLED"] },
  ];

/** Seeded booking stages (Q-09: Booked → Agreement → Closed/Won; registration available but off). */
export const DEFAULT_BOOKING_STAGES: { key: string; label: string; isActive: boolean }[] = [
  { key: "BOOKED", label: "Booked", isActive: true },
  { key: "AGREEMENT", label: "Agreement signed", isActive: true },
  { key: "REGISTRATION", label: "Registration done", isActive: false },
];

/** Booking fields that are values (Q-16): shown and changed only with `bookings.view_value`. */
export const BOOKING_VALUE_FIELDS = ["agreementValue", "tokenAmount"] as const;
