import { TZDate } from "@date-fns/tz";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

/**
 * Date ranges for dashboards, reports and filters (PRD §10, §13, §15: "day, week, month and custom").
 * Ranges are calendar dates (`yyyy-MM-dd`) in the organization's timezone; `toUtcBounds` converts them to
 * the UTC instants used in database queries.
 */
export const DATE_RANGE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "last_30_days", label: "Last 30 days" },
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number]["value"];

export interface DateRange {
  from: string;
  to: string;
}

const ISO_DATE = "yyyy-MM-dd";

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isValid(parse(value, ISO_DATE, new Date()));
}

/** Resolves a preset to a calendar-date range in `timezone`. */
export function presetRange(
  preset: DateRangePreset,
  options: { timezone: string; weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6; now?: Date },
): DateRange {
  const now = new TZDate(options.now ?? new Date(), options.timezone);
  const today = startOfDay(now);
  const weekStartsOn = options.weekStartsOn ?? 1;
  const range = (from: Date, to: Date): DateRange => ({
    from: format(from, ISO_DATE),
    to: format(to, ISO_DATE),
  });

  switch (preset) {
    case "today":
      return range(today, today);
    case "yesterday": {
      const yesterday = subDays(today, 1);
      return range(yesterday, yesterday);
    }
    case "this_week":
      return range(startOfWeek(today, { weekStartsOn }), endOfWeek(today, { weekStartsOn }));
    case "last_7_days":
      return range(subDays(today, 6), today);
    case "this_month":
      return range(startOfMonth(today), endOfMonth(today));
    case "last_30_days":
      return range(subDays(today, 29), today);
  }
}

/** Converts a calendar-date range in `timezone` into half-open UTC bounds `[gte, lt)` for queries. */
export function toUtcBounds(range: DateRange, timezone: string): { gte: Date; lt: Date } {
  const [fromYear, fromMonth, fromDay] = range.from.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [toYear, toMonth, toDay] = range.to.split("-").map(Number) as [number, number, number];
  const start = new TZDate(fromYear, fromMonth - 1, fromDay, timezone);
  const endExclusive = addDays(new TZDate(toYear, toMonth - 1, toDay, timezone), 1);
  return { gte: new Date(start.getTime()), lt: new Date(endExclusive.getTime()) };
}

/** Human label for a range, e.g. "01 Sep 2026 – 30 Sep 2026" (single date when from = to). */
export function formatDateRangeLabel(range: DateRange, dateFormat = "dd MMM yyyy"): string {
  const from = parse(range.from, ISO_DATE, new Date());
  const to = parse(range.to, ISO_DATE, new Date());
  if (range.from === range.to) return format(from, dateFormat);
  return `${format(from, dateFormat)} – ${format(to, dateFormat)}`;
}

/** Calendar date (`yyyy-MM-dd`) and wall-clock time (`HH:mm`) of an instant in `timezone`. */
export function zonedClock(instant: Date, timezone: string): { date: string; time: string } {
  const local = new TZDate(instant, timezone);
  return { date: format(local, ISO_DATE), time: format(local, "HH:mm") };
}

/** Value for an `<input type="datetime-local">` showing `value` in `timezone` ("" when empty). */
export function toZonedInputValue(
  value: string | Date | null | undefined,
  timezone: string,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(new TZDate(date, timezone), "yyyy-MM-dd'T'HH:mm");
}

/** Reads an `<input type="datetime-local">` value as a wall-clock time in `timezone`; returns UTC ISO or null. */
export function fromZonedInputValue(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const local = new TZDate(year, month - 1, day, hour, minute, 0, timezone);
  return new Date(local.getTime()).toISOString();
}
