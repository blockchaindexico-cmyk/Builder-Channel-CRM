import { z } from "zod";

import { optionalAmount, optionalArea, optionalText } from "@/lib/fields";

import { BOOKING_DOCUMENT_MAX_BYTES } from "./constants";

const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .nullable()
  .optional()
  .transform((value) => value || null);

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

// --- Site visits (M08-03 → M08-05) -------------------------------------------------------------------------------

/** Where and when a visit happens. */
export const visitInputSchema = z.object({
  projectId: z.uuid("Choose the project"),
  scheduledAt: instant,
  pickupRequired: z.boolean().default(false),
  pickupAddress: optionalText(300),
  attendees: z.number().int().min(1).max(50).nullable().optional(),
  notes: optionalText(1000),
});
export type VisitInput = z.input<typeof visitInputSchema>;

export const scheduleVisitSchema = visitInputSchema.extend({
  leadId: z.uuid(),
  /** Completed visit this revisit follows; by default the lead's latest completed visit. */
  parentVisitId: optionalUuid,
});
export type ScheduleVisitInput = z.input<typeof scheduleVisitSchema>;

export const visitIdSchema = z.object({ visitId: z.uuid() });

export const completeVisitSchema = z.object({
  visitId: z.uuid(),
  outcomeId: z.uuid("Choose how the visit went"),
  feedback: optionalText(2000),
  /** Who went with the customer; by default the executive the visit was planned for. */
  conductedById: optionalUuid,
});
export type CompleteVisitInput = z.input<typeof completeVisitSchema>;

export const noShowVisitSchema = z.object({ visitId: z.uuid(), notes: optionalText(500) });

export const cancelVisitSchema = z.object({
  visitId: z.uuid(),
  reason: z.string().trim().min(3, "Say why it is cancelled").max(500),
});

export const rescheduleVisitSchema = z.object({
  visitId: z.uuid(),
  scheduledAt: instant,
  notes: optionalText(1000),
});
export type RescheduleVisitInput = z.input<typeof rescheduleVisitSchema>;

// --- Bookings (M08-07 → M08-10) ----------------------------------------------------------------------------------

/** Booking details anyone managing the booking may fill in. */
const bookingDetailsShape = {
  projectId: z.uuid("Choose the project"),
  customerName: z.string().trim().min(2, "Enter the customer's name").max(120),
  coApplicantName: optionalText(120),
  unitNumber: optionalText(30),
  tower: optionalText(60),
  floor: optionalText(20),
  configurationTypeId: optionalUuid,
  area: optionalArea,
  bookingDate: calendarDate,
  paymentPlan: optionalText(200),
  builderReference: optionalText(60),
  remarks: optionalText(2000),
};

/** Value fields (Q-16): only people with `bookings.view_value` may send them; left out = unchanged. */
const bookingValueShape = {
  agreementValue: optionalAmount.optional(),
  tokenAmount: optionalAmount.optional(),
};

export const createBookingSchema = z.object({
  leadId: z.uuid(),
  ...bookingDetailsShape,
  ...bookingValueShape,
  /** Executive credited with the booking; by default the lead's owner (Q-10). */
  executiveId: optionalUuid,
  /** Site visit that led to the booking. */
  visitId: optionalUuid,
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

export const updateBookingSchema = z.object({
  bookingId: z.uuid(),
  ...bookingDetailsShape,
  ...bookingValueShape,
  executiveId: z.uuid("Choose the executive").optional(),
  /** Why the booking changed (kept in its history). */
  note: optionalText(500),
});
export type UpdateBookingInput = z.input<typeof updateBookingSchema>;

export const moveBookingStageSchema = z.object({
  bookingId: z.uuid(),
  stageId: z.uuid("Choose the stage"),
  note: optionalText(500),
});

export const closeBookingSchema = z.object({ bookingId: z.uuid(), note: optionalText(1000) });

export const cancelBookingSchema = z.object({
  bookingId: z.uuid(),
  reasonId: z.uuid("Choose why it was cancelled"),
  notes: optionalText(1000),
  /** What happens to the lead when no other booking is open: lost, or back to an active status. */
  leadOutcome: z.enum(["LOST", "ACTIVE"]).default("LOST"),
  /** Status the lead goes back to with "ACTIVE". */
  leadStatusKey: z.string().trim().max(40).nullable().optional(),
});
export type CancelBookingInput = z.input<typeof cancelBookingSchema>;

export const requestBookingDocumentSchema = z.object({
  bookingId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive().max(BOOKING_DOCUMENT_MAX_BYTES, "Documents can be up to 20 MB"),
  title: optionalText(120),
});

// --- Closures (M08-11) -------------------------------------------------------------------------------------------

export const markLostSchema = z.object({
  leadId: z.uuid(),
  statusKey: z.enum(["LOST", "NOT_INTERESTED"]),
  lossReasonId: z.uuid("Choose a reason"),
  notes: z.string().trim().min(3, "Add a short note").max(500),
});
export type MarkLostInput = z.input<typeof markLostSchema>;

// --- Settings (M08-02) -------------------------------------------------------------------------------------------

export const visitOutcomeSchema = z.object({
  label: z.string().trim().min(2, "Name the outcome").max(60),
  category: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "BOOKING"]),
  nextStep: z
    .enum(["REVISIT", "FOLLOW_UP", "BOOKING", "CLOSE"])
    .nullable()
    .optional()
    .default(null),
  isActive: z.boolean().default(true),
});
export type VisitOutcomeInput = z.input<typeof visitOutcomeSchema>;

export const lossReasonSchema = z.object({
  label: z.string().trim().min(2, "Name the reason").max(80),
  appliesTo: z
    .array(z.enum(["LOST", "NOT_INTERESTED", "BOOKING_CANCELLED"]))
    .min(1, "Choose where the reason can be used")
    .transform((values) => [...new Set(values)]),
  isActive: z.boolean().default(true),
});
export type LossReasonInput = z.input<typeof lossReasonSchema>;

export const bookingStageSchema = z.object({
  label: z.string().trim().min(2, "Name the stage").max(60),
  isActive: z.boolean().default(true),
});

export const dealSettingsSchema = z.object({
  /** Reminder to the executive this long before a visit (0 = at the visit time). */
  visitReminderMinutes: z.number().int().min(0).max(2880).default(120),
  /** Upcoming visits move with the lead when it is reassigned. */
  transferVisitsOnReassign: z.boolean().default(true),
  /** A visit without an outcome this long after its time is flagged and its executive reminded. */
  outcomeDueHours: z.number().int().min(1).max(168).default(4),
});
export type DealSettings = z.output<typeof dealSettingsSchema>;
