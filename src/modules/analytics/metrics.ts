/**
 * Metric definitions (M10-01, BUILD_PLAN §1.6). Every dashboard and report computes these the same way, for the
 * viewer's data scope and filters. Activity metrics are attributed to the member who did the work, on the day it
 * happened in the organization's time zone; lead outcomes to the lead's owner.
 */
export interface MetricDefinition {
  key: MetricKey;
  label: string;
  description: string;
  /** Whether a rise is good news (colours the change vs the previous period). */
  higherIsBetter: boolean | null;
}

export const COUNTER_KEYS = [
  "leadsAssigned",
  "leadsCreated",
  "calls",
  "callsConnected",
  "callsPositive",
  "callsNegative",
  "callsUnresponsive",
  "callsCallback",
  "talkSeconds",
  "followUpsDue",
  "followUpsCompleted",
  "followUpsOnTime",
  "followUpsMissed",
  "visitsCompleted",
  "revisitsCompleted",
  "visitsNoShow",
  "bookings",
  "closures",
  "bookingsCancelled",
  "lost",
  "notInterested",
] as const;
export type CounterKey = (typeof COUNTER_KEYS)[number];
export type Counters = Record<CounterKey, number>;

export type MetricKey = CounterKey | "connectRate" | "followUpAdherence" | "visitToBooking";

export const emptyCounters = (): Counters =>
  Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0])) as Counters;

export function addCounters(target: Counters, source: Partial<Counters>): Counters {
  for (const key of COUNTER_KEYS) target[key] += Number(source[key] ?? 0);
  return target;
}

const definitions: MetricDefinition[] = [
  {
    key: "leadsAssigned",
    label: "Leads assigned",
    description: "Assignments and reassignments to the member in the period.",
    higherIsBetter: null,
  },
  {
    key: "leadsCreated",
    label: "Leads added",
    description: "Leads created by the member (manual entry, import or intake).",
    higherIsBetter: true,
  },
  {
    key: "calls",
    label: "Calls",
    description: "Calls logged by the member, connected or not.",
    higherIsBetter: true,
  },
  {
    key: "callsConnected",
    label: "Connected calls",
    description: "Calls marked as connected.",
    higherIsBetter: true,
  },
  {
    key: "callsPositive",
    label: "Positive calls",
    description: "Calls whose outcome counts as positive or interested.",
    higherIsBetter: true,
  },
  {
    key: "callsNegative",
    label: "Negative calls",
    description: "Calls whose outcome counts as negative or not interested.",
    higherIsBetter: false,
  },
  {
    key: "callsUnresponsive",
    label: "Unresponsive calls",
    description: "Calls whose outcome counts as unresponsive (no answer, busy, switched off…).",
    higherIsBetter: false,
  },
  {
    key: "callsCallback",
    label: "Callbacks asked",
    description: "Calls where the customer asked to be called back.",
    higherIsBetter: null,
  },
  {
    key: "talkSeconds",
    label: "Talk time",
    description: "Total duration of the calls, in seconds.",
    higherIsBetter: true,
  },
  {
    key: "followUpsDue",
    label: "Follow-ups due",
    description: "Follow-ups and callbacks due in the period (moved or cancelled ones excluded).",
    higherIsBetter: null,
  },
  {
    key: "followUpsCompleted",
    label: "Follow-ups done",
    description: "Follow-ups and callbacks completed in the period.",
    higherIsBetter: true,
  },
  {
    key: "followUpsOnTime",
    label: "Done on time",
    description:
      "Of the follow-ups due in the period, those completed before they were marked missed.",
    higherIsBetter: true,
  },
  {
    key: "followUpsMissed",
    label: "Follow-ups missed",
    description: "Follow-ups that passed their grace period without being done.",
    higherIsBetter: false,
  },
  {
    key: "visitsCompleted",
    label: "Site visits",
    description: "First visits completed (by the executive the visit was planned for).",
    higherIsBetter: true,
  },
  {
    key: "revisitsCompleted",
    label: "Revisits",
    description: "Revisits completed.",
    higherIsBetter: true,
  },
  {
    key: "visitsNoShow",
    label: "No-shows",
    description: "Visits where the customer did not come.",
    higherIsBetter: false,
  },
  {
    key: "bookings",
    label: "Bookings",
    description: "Bookings made, credited to their executive, by booking date.",
    higherIsBetter: true,
  },
  {
    key: "closures",
    label: "Closed / won",
    description: "Bookings closed as won, by closing day.",
    higherIsBetter: true,
  },
  {
    key: "bookingsCancelled",
    label: "Bookings cancelled",
    description: "Bookings cancelled, by cancellation day.",
    higherIsBetter: false,
  },
  {
    key: "lost",
    label: "Lost",
    description: "Leads closed as lost, attributed to their owner.",
    higherIsBetter: false,
  },
  {
    key: "notInterested",
    label: "Not interested",
    description: "Leads closed as not interested, attributed to their owner.",
    higherIsBetter: false,
  },
  {
    key: "connectRate",
    label: "Connect rate",
    description: "Connected calls ÷ calls.",
    higherIsBetter: true,
  },
  {
    key: "followUpAdherence",
    label: "Follow-up adherence",
    description: "Follow-ups done on time ÷ follow-ups due.",
    higherIsBetter: true,
  },
  {
    key: "visitToBooking",
    label: "Visit → booking",
    description: "Bookings ÷ completed visits and revisits in the period.",
    higherIsBetter: true,
  },
];

export const METRICS: Record<MetricKey, MetricDefinition> = Object.fromEntries(
  definitions.map((definition) => [definition.key, definition]),
) as Record<MetricKey, MetricDefinition>;

/** A ratio in percent with one decimal, or null when the base is zero. */
export const ratio = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export function derived(counters: Counters) {
  return {
    connectRate: ratio(counters.callsConnected, counters.calls),
    followUpAdherence: ratio(counters.followUpsOnTime, counters.followUpsDue),
    visitToBooking: ratio(counters.bookings, counters.visitsCompleted + counters.revisitsCompleted),
  };
}
