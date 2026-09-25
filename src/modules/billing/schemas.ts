import { z } from "zod";

import { optionalAmount, optionalText } from "@/lib/fields";

const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .nullable()
  .optional()
  .transform((value) => value || null);

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const optionalCalendarDate = z
  .union([z.literal(""), calendarDate])
  .nullable()
  .optional()
  .transform((value) => value || null);

/** A required amount (the same inputs as elsewhere: 85000, 85,000, 85 K, 1.2 L…). */
const amount = (message: string) =>
  optionalAmount.refine((value): value is string => Boolean(value), message) as z.ZodType<
    string,
    string | null | undefined
  >;

/** A percentage 0–100 with up to three decimals, as a string. */
const percentage = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine(
    (value) => /^\d{1,3}(\.\d{1,3})?$/.test(value) && Number(value) <= 100,
    "Enter a percentage from 0 to 100",
  );

// --- Settings (M09-02) -------------------------------------------------------------------------------------------

export const billingSettingsSchema = z.object({
  legalName: z.string().trim().max(200).default(""),
  taxRegistrationLabel: z.string().trim().max(30).default("GSTIN"),
  taxRegistrationId: z.string().trim().max(30).default(""),
  /** Permanent account number or other second id printed on invoices. */
  secondaryIdLabel: z.string().trim().max(30).default("PAN"),
  secondaryId: z.string().trim().max(30).default(""),
  addressLine: z.string().trim().max(300).default(""),
  city: z.string().trim().max(100).default(""),
  state: z.string().trim().max(100).default(""),
  postalCode: z.string().trim().max(20).default(""),
  email: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,10}$/, "Use up to 10 letters, digits or dashes")
    .default("INV"),
  numberPadding: z.number().int().min(3).max(8).default(4),
  /** Total tax on commission, e.g. 18 (GST). */
  taxRate: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter the tax rate")
    .default("18"),
  splitTax: z.boolean().default(true),
  splitTaxLabels: z
    .tuple([z.string().trim().min(1).max(12), z.string().trim().min(1).max(12)])
    .default(["CGST", "SGST"]),
  singleTaxLabel: z.string().trim().min(1).max(12).default("IGST"),
  /** Tax the builder deducts at source on commission, e.g. 2 (TDS u/s 194H). */
  tdsRate: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, "Enter the rate")
    .default("2"),
  serviceCode: z.string().trim().max(20).default("997221"),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  /** Which date picks the rate card: the booking date or the closing date. */
  commissionDate: z.enum(["BOOKING_DATE", "CLOSING_DATE"]).default("BOOKING_DATE"),
  bankName: z.string().trim().max(100).default(""),
  bankAccountName: z.string().trim().max(150).default(""),
  bankAccountNumber: z.string().trim().max(40).default(""),
  bankCode: z.string().trim().max(20).default(""),
  bankBranch: z.string().trim().max(100).default(""),
  terms: z
    .string()
    .trim()
    .max(2000)
    .default("Payment is due within the terms above. Please quote the invoice number."),
  /** Internal: the Accounts role was offered once (so deleting it sticks). */
  accountsRoleOffered: z.boolean().default(false),
});
export type BillingSettings = z.output<typeof billingSettingsSchema>;

// --- Commission rate cards (M09-04) ------------------------------------------------------------------------------

export const commissionSlabSchema = z.object({
  from: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).replace(/,/g, "").trim()),
  to: z
    .union([z.string(), z.number(), z.null()])
    .transform((value) =>
      value === null || String(value).trim() === "" ? null : String(value).replace(/,/g, "").trim(),
    ),
  percentage,
});

export const commissionTermSchema = z.object({
  builderId: z.uuid("Choose the builder"),
  projectId: optionalUuid,
  name: optionalText(80),
  type: z.enum(["PERCENTAGE", "FLAT", "SLAB"]),
  percentage: percentage
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  flatAmount: optionalAmount,
  slabBasis: z
    .enum(["VALUE", "VOLUME"])
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  slabs: z.array(commissionSlabSchema).max(20).default([]),
  validFrom: calendarDate,
  validTo: optionalCalendarDate,
  notes: optionalText(500),
  isActive: z.boolean().default(true),
});
export type CommissionTermInput = z.input<typeof commissionTermSchema>;

// --- Deal financials (M09-06) ------------------------------------------------------------------------------------

export const dealFinancialUpdateSchema = z.object({
  dealId: z.uuid(),
  /** Set by hand instead of the rate card; null = back to the rate card. */
  grossCommission: optionalAmount,
  overrideReason: optionalText(300),
  taxRate: percentage,
  tdsRate: percentage,
  cashback: optionalAmount,
  subBrokerPayout: optionalAmount,
  subBrokerName: optionalText(120),
  executiveIncentive: optionalAmount,
  expenses: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Describe the expense").max(120),
        amount: amount("Enter the amount"),
      }),
    )
    .max(30)
    .default([]),
  notes: optionalText(1000),
});
export type DealFinancialUpdateInput = z.input<typeof dealFinancialUpdateSchema>;

export const unlockDealSchema = z.object({
  dealId: z.uuid(),
  reason: z.string().trim().min(3, "Say why it is unlocked").max(300),
});

// --- Invoices (M09-07 → M09-09) ----------------------------------------------------------------------------------

export const invoiceDraftSchema = z.object({
  builderId: z.uuid("Choose the builder"),
  dealIds: z.array(z.uuid()).max(200).default([]),
  manualLines: z
    .array(
      z.object({
        description: z.string().trim().min(2, "Describe the line").max(300),
        amount: amount("Enter the amount"),
      }),
    )
    .max(50)
    .default([]),
  intraState: z.boolean().default(true),
  notes: optionalText(2000),
});
export type InvoiceDraftInput = z.input<typeof invoiceDraftSchema>;

export const issueInvoiceSchema = z.object({
  invoiceId: z.uuid(),
  issueDate: calendarDate,
  dueDate: optionalCalendarDate,
});

export const cancelInvoiceSchema = z.object({
  invoiceId: z.uuid(),
  reason: z.string().trim().min(3, "Say why it is cancelled").max(300),
});

export const sendInvoiceSchema = z.object({
  invoiceId: z.uuid(),
  to: z.email("Enter a valid e-mail address"),
  message: optionalText(1000),
});

export const paymentSchema = z.object({
  invoiceId: z.uuid(),
  receivedOn: calendarDate,
  amount: amount("Enter the amount received"),
  tdsDeducted: optionalAmount,
  mode: z.enum(["BANK_TRANSFER", "CHEQUE", "UPI", "CASH", "OTHER"]),
  reference: optionalText(80),
  notes: optionalText(500),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export const voidPaymentSchema = z.object({
  paymentId: z.uuid(),
  reason: z.string().trim().min(3, "Say why").max(300),
});

// --- Business expenses (M09-15) ----------------------------------------------------------------------------------

export const businessExpenseSchema = z.object({
  spentOn: calendarDate,
  category: z.enum(["MARKETING", "SALARIES", "RENT", "TRAVEL", "SOFTWARE", "OTHER"]),
  description: z.string().trim().min(2, "Describe the expense").max(200),
  amount: amount("Enter the amount"),
  sourceId: optionalUuid,
  campaignId: optionalUuid,
  projectId: optionalUuid,
  paidTo: optionalText(120),
  reference: optionalText(80),
});
export type BusinessExpenseInput = z.input<typeof businessExpenseSchema>;
