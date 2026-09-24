import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Phone helpers (M01-22; used by lead de-duplication in M04). Numbers are stored in E.164 (`+919820000000`)
 * and displayed in international format. `defaultCountry` is the organization's country setting.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: string,
): string | null {
  if (!input) return null;
  const parsed = parsePhoneNumberFromString(
    input.trim(),
    defaultCountry.toUpperCase() as CountryCode,
  );
  return parsed?.isValid() ? parsed.number : null;
}

export function formatPhone(value: string | null | undefined, defaultCountry = "IN"): string {
  if (!value) return "—";
  const parsed = parsePhoneNumberFromString(value, defaultCountry.toUpperCase() as CountryCode);
  return parsed ? parsed.formatInternational() : value;
}
