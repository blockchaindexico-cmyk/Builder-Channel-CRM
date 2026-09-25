import { z } from "zod";

import { compareDecimals, parseAmountInput } from "@/lib/decimal";

/**
 * Reusable zod fields for forms and services. Blank strings become null, so the same schema validates browser
 * input and service calls (BUILD_PLAN §2.6: services re-validate everything).
 */

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .refine(
    (value) => !value || /^https?:\/\/\S+$/i.test(value),
    "Enter a full link starting with https://",
  );

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .refine((value) => !value || z.email().safeParse(value).success, "Enter a valid e-mail address");

/** Codes like BLD-0001 or LODHA: letters, digits and dashes; blank = generate. */
export const optionalCode = z
  .string()
  .trim()
  .toUpperCase()
  .max(20)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .refine(
    (value) => !value || /^[A-Z0-9][A-Z0-9-]{1,19}$/.test(value),
    "Use 2–20 letters, digits or dashes",
  );

export const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Choose a date");

export const optionalInt = (max: number) =>
  z
    .union([z.literal(""), z.coerce.number().int("Enter a whole number").min(0).max(max)])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

/** Money typed by a person ("85 L", "1.2 Cr", "85,00,000") → decimal string, or null when blank. */
export const optionalAmount = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const parsed = parseAmountInput(value);
    if (parsed === null || parsed.split(".")[0]!.length > 12) {
      ctx.addIssue({ code: "custom", message: "Enter an amount such as 8500000, 85 L or 1.2 Cr" });
      return z.NEVER;
    }
    return parsed;
  });

/** Area in square feet (plain number, up to 2 decimals). */
export const optionalArea = z
  .string()
  .trim()
  .max(20)
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const cleaned = value.replace(/,/g, "");
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(cleaned)) {
      ctx.addIssue({ code: "custom", message: "Enter the area in sq ft, e.g. 650" });
      return z.NEVER;
    }
    return cleaned.replace(/^0+(?=\d)/, "");
  });

export function assertRange(
  ctx: z.RefinementCtx,
  min: string | null | undefined,
  max: string | null | undefined,
  path: (string | number)[],
  label: string,
) {
  if (min && max && compareDecimals(min, max) > 0) {
    ctx.addIssue({
      code: "custom",
      path,
      message: `The maximum ${label} must not be below the minimum`,
    });
  }
}
