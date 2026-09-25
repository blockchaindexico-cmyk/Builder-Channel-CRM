import {
  addDays,
  differenceInCalendarDays,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { DateRange } from "@/lib/date-range";

/**
 * Periods of dashboards and reports (M10-02): calendar-date ranges in the organization's time zone, split into day,
 * week or month buckets, and compared with the period of the same length just before.
 */
export type Granularity = "day" | "week" | "month";

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const ISO = "yyyy-MM-dd";
const toDate = (value: string) => parse(value, ISO, new Date(2000, 0, 1));
const toIso = (value: Date) => format(value, ISO);

export const daysIn = (range: DateRange) =>
  differenceInCalendarDays(toDate(range.to), toDate(range.from)) + 1;

/** The period of the same length that ends the day before `range` starts. */
export function previousPeriod(range: DateRange): DateRange {
  const length = daysIn(range);
  const end = addDays(toDate(range.from), -1);
  return { from: toIso(addDays(end, -(length - 1))), to: toIso(end) };
}

/** A sensible bucket size for a range: days up to ~2 months, weeks up to ~6 months, months beyond. */
export function defaultGranularity(range: DateRange): Granularity {
  const length = daysIn(range);
  if (length <= 62) return "day";
  if (length <= 190) return "week";
  return "month";
}

export interface Bucket {
  /** First day of the bucket (the week's first day, the month's 1st), clipped to the range. */
  key: string;
  from: string;
  to: string;
  label: string;
}

/** The bucket a day falls in. */
export function bucketKeyOf(
  day: string,
  granularity: Granularity,
  weekStartsOn: 0 | 1 = 1,
): string {
  if (granularity === "day") return day;
  const date = toDate(day);
  return toIso(granularity === "week" ? startOfWeek(date, { weekStartsOn }) : startOfMonth(date));
}

/** Every bucket of the range in order, including empty ones (charts need the gaps). */
export function bucketsOf(
  range: DateRange,
  granularity: Granularity,
  weekStartsOn: 0 | 1 = 1,
): Bucket[] {
  const buckets = new Map<string, Bucket>();
  const last = toDate(range.to);
  for (let day = toDate(range.from); day <= last; day = addDays(day, 1)) {
    const iso = toIso(day);
    const key = bucketKeyOf(iso, granularity, weekStartsOn);
    const bucket = buckets.get(key);
    if (bucket) bucket.to = iso;
    else buckets.set(key, { key, from: iso, to: iso, label: "" });
  }
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    label:
      granularity === "day"
        ? format(toDate(bucket.from), "d MMM")
        : granularity === "week"
          ? `${format(toDate(bucket.from), "d MMM")}–${format(toDate(bucket.to), "d MMM")}`
          : format(toDate(bucket.from), "MMM yyyy"),
  }));
}

/** Every day of the range. */
export function daysOf(range: DateRange): string[] {
  const days: string[] = [];
  const last = toDate(range.to);
  for (let day = toDate(range.from); day <= last; day = addDays(day, 1)) days.push(toIso(day));
  return days;
}

/** Change vs the previous period in percent (one decimal), or null when there was nothing before. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
