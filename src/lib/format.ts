import { TZDate } from "@date-fns/tz";
import { format as formatDateFns, formatDistanceStrict, parse as parseDateFns } from "date-fns";

/**
 * Formatting helpers (M01-22). All take the organization's regional settings so every screen formats
 * money, numbers and dates the same way (timestamps are stored in UTC and shown in the org timezone).
 */
export interface RegionalFormatSettings {
  timezone: string;
  currency: string;
  locale: string;
  dateFormat: string;
}

export const DEFAULT_REGIONAL_SETTINGS: RegionalFormatSettings = {
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
  dateFormat: "dd MMM yyyy",
};

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Money with the org currency, e.g. ₹12,34,567 (en-IN) or $1,234,567 (en-US). Accepts Decimal-like values. */
export function formatMoney(
  value: number | string | { toString(): string } | null | undefined,
  settings: Pick<RegionalFormatSettings, "currency" | "locale">,
  options: { decimals?: number; compact?: boolean } = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
    notation: options.compact ? "compact" : "standard",
    minimumFractionDigits: options.compact ? 0 : (options.decimals ?? 0),
    // Two decimals keep compact prices honest: ₹1.65Cr, not ₹1.7Cr.
    maximumFractionDigits: options.compact ? 2 : (options.decimals ?? 2),
  }).format(amount);
}

export function formatNumber(
  value: number | null | undefined,
  settings: Pick<RegionalFormatSettings, "locale">,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(settings.locale, options).format(value);
}

/** Calendar date in the org timezone using the org date format. */
export function formatDate(
  value: DateInput,
  settings: Pick<RegionalFormatSettings, "timezone" | "dateFormat">,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatDateFns(new TZDate(date, settings.timezone), settings.dateFormat);
}

/** Date and time in the org timezone, e.g. "24 Sep 2026, 3:45 PM". */
export function formatDateTime(
  value: DateInput,
  settings: Pick<RegionalFormatSettings, "timezone" | "dateFormat">,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatDateFns(new TZDate(date, settings.timezone), `${settings.dateFormat}, h:mm a`);
}

/** Time only in the org timezone, e.g. "3:45 PM". */
export function formatTime(
  value: DateInput,
  settings: Pick<RegionalFormatSettings, "timezone">,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return formatDateFns(new TZDate(date, settings.timezone), "h:mm a");
}

/** Relative time, e.g. "5 minutes ago" / "in 2 days". */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "—";
  const suffix = date.getTime() > now.getTime();
  if (Math.abs(date.getTime() - now.getTime()) < 45_000) return "just now";
  const distance = formatDistanceStrict(date, now);
  return suffix ? `in ${distance}` : `${distance} ago`;
}

/**
 * Calendar dates without a time (launch, possession, birthdays) are exchanged as `yyyy-MM-dd` strings and
 * formatted as-is — never shifted by a timezone.
 */
export function formatCalendarDate(
  value: string | null | undefined,
  settings: Pick<RegionalFormatSettings, "dateFormat">,
): string {
  if (!value) return "—";
  const date = parseDateFns(value.slice(0, 10), "yyyy-MM-dd", new Date(2000, 0, 1));
  return Number.isNaN(date.getTime()) ? "—" : formatDateFns(date, settings.dateFormat);
}

/** Month and year of a calendar date, e.g. "Dec 2027" (possession timelines). */
export function formatMonthYear(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseDateFns(value.slice(0, 10), "yyyy-MM-dd", new Date(2000, 0, 1));
  return Number.isNaN(date.getTime()) ? "—" : formatDateFns(date, "MMM yyyy");
}

/** `yyyy-MM-dd` for a date-only database value (stored at UTC midnight). */
export function toCalendarDateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
