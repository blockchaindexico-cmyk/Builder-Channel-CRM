import { z } from "zod";

/** Modern IANA names that ICU still reports under legacy aliases (e.g. Asia/Calcutta). */
const PREFERRED_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Ho_Chi_Minh",
  "Asia/Yangon",
  "Europe/Kyiv",
];
const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

/** True for any timezone the runtime can format with (accepts canonical names and aliases). */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const SUPPORTED_LOCALES = [
  { value: "en-IN", label: "English (India) — 12,34,567.89" },
  { value: "en-US", label: "English (United States) — 1,234,567.89" },
  { value: "en-GB", label: "English (United Kingdom) — 1,234,567.89" },
  { value: "en-AE", label: "English (UAE) — 1,234,567.89" },
  { value: "en-SG", label: "English (Singapore) — 1,234,567.89" },
] as const;

export const DATE_FORMATS = [
  { value: "dd MMM yyyy", label: "24 Sep 2026" },
  { value: "dd/MM/yyyy", label: "24/09/2026" },
  { value: "MM/dd/yyyy", label: "09/24/2026" },
  { value: "yyyy-MM-dd", label: "2026-09-24" },
  { value: "d MMMM yyyy", label: "24 September 2026" },
] as const;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

/** Organization profile form (M01-24). Shared by the form (client) and the service (server). */
export const organizationProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(120),
  legalName: optionalText(200),
  email: z
    .union([z.literal(""), z.email("Enter a valid e-mail address")])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  phone: optionalText(30),
  website: z
    .union([z.literal(""), z.url("Enter a valid URL, e.g. https://example.com")])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a 2-letter ISO country code, e.g. IN"),
  timezone: z.string().trim().min(1).refine(isValidTimezone, "Unknown timezone"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => CURRENCIES.has(value), "Unknown currency code"),
  locale: z.enum(SUPPORTED_LOCALES.map((l) => l.value) as [string, ...string[]]),
  dateFormat: z.enum(DATE_FORMATS.map((f) => f.value) as [string, ...string[]]),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
});

export type OrganizationProfileInput = z.input<typeof organizationProfileSchema>;
export type OrganizationProfileValues = z.output<typeof organizationProfileSchema>;

export const LOGO_PURPOSE = "organization.logo";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export const requestLogoUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(LOGO_TYPES),
  size: z.number().int().positive().max(LOGO_MAX_BYTES, "The logo must be 2 MB or smaller"),
});

export const completeLogoUploadSchema = z.object({ fileId: z.uuid() });

export const sendTestEmailSchema = z.object({ to: z.email("Enter a valid e-mail address") });

export function listTimezones(): string[] {
  const legacy = new Set([
    "Asia/Calcutta",
    "Asia/Katmandu",
    "Asia/Saigon",
    "Asia/Rangoon",
    "Europe/Kiev",
  ]);
  const zones = Intl.supportedValuesOf("timeZone").filter((zone) => !legacy.has(zone));
  return [...new Set([...zones, ...PREFERRED_TIMEZONES])].sort();
}

export function listCurrencies(): string[] {
  return [...CURRENCIES].sort();
}
