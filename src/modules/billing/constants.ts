import type {
  BusinessExpenseCategory,
  CommissionType,
  DealFinancialStatus,
  InvoiceStatus,
  PaymentMode,
} from "@/generated/prisma/enums";

/** Organization settings namespace of billing (rule T6). */
export const BILLING_SETTINGS_NAMESPACE = "billing";

export const INVOICE_PDF_PURPOSE = "billing.invoice";
export const INVOICE_PDF_MAX_BYTES = 5 * 1024 * 1024;

export const COMMISSION_TYPES: { value: CommissionType; label: string }[] = [
  { value: "PERCENTAGE", label: "Percentage of the agreement value" },
  { value: "FLAT", label: "Flat amount per deal" },
  { value: "SLAB", label: "Slabs" },
];

export const DEAL_FINANCIAL_STATUSES: { value: DealFinancialStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const INVOICE_STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "PARTIALLY_PAID", label: "Partly paid" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** Invoices that are still owed money. */
export const OPEN_INVOICE_STATUSES = [
  "ISSUED",
  "PARTIALLY_PAID",
] as const satisfies InvoiceStatus[];

export const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "UPI", label: "UPI" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

export const EXPENSE_CATEGORIES: { value: BusinessExpenseCategory; label: string }[] = [
  { value: "MARKETING", label: "Marketing" },
  { value: "SALARIES", label: "Salaries" },
  { value: "RENT", label: "Rent & office" },
  { value: "TRAVEL", label: "Travel" },
  { value: "SOFTWARE", label: "Software" },
  { value: "OTHER", label: "Other" },
];

/** The optional "Accounts" role offered once to every organization (Q-16). */
export const ACCOUNTS_ROLE = {
  key: "accounts",
  name: "Accounts",
  description: "Billing, collections, deal financials and profit & loss; sees booking values.",
} as const;
