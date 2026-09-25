import { normalizePhone } from "@/lib/phone";

/**
 * Normalized contact values (M04-04) used for duplicate detection and search. Numbers that parse become
 * E.164 (+919820012345); others keep their digits so imports with odd formats still match each other.
 */
export function normalizeMobile(value: string | null | undefined, country: string): string | null {
  if (!value?.trim()) return null;
  const parsed = normalizePhone(value, country);
  if (parsed) return parsed;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

/** Field errors for numbers that cannot be phone numbers (fewer than 6 digits), keyed like the lead form. */
export function contactNumberErrors(
  values: { mobile?: string | null; alternateMobile?: string | null },
  country: string,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (values.mobile?.trim() && !normalizeMobile(values.mobile, country)) {
    errors.mobile = ["Enter a valid mobile number"];
  }
  if (values.alternateMobile?.trim() && !normalizeMobile(values.alternateMobile, country)) {
    errors.alternateMobile = ["Enter a valid mobile number"];
  }
  return errors;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Turns a search string into mobile digits when it looks like a phone number: "+91 98200-12345",
 * "098200 12345" and "9820012345" all search for "9820012345" (the last 10 digits).
 */
export function mobileSearchDigits(query: string): string | null {
  if (/[a-z@]/i.test(query)) return null;
  const digits = query.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.length > 10 ? digits.slice(-10) : digits.replace(/^0+(?=\d{10})/, "");
}

/** Lead numbers typed as "LD-000123", "ld123" or "123". */
export function leadNumberSearch(query: string): string | null {
  const match = /^(?:ld)?-?0*(\d{1,9})$/i.exec(query.trim());
  return match ? match[1]! : null;
}
