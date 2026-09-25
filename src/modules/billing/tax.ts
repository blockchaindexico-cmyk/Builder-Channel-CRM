import { dec, percentOf, round2, toMoney } from "./money";

export interface TaxLine {
  label: string;
  /** Percentage, e.g. "9". */
  rate: string;
  amount: string;
}

export interface TaxSetup {
  /** Total tax rate, e.g. 18. */
  rate: string;
  /** Split into two halves when both parties are in the same state (e.g. CGST + SGST). */
  split: boolean;
  splitLabels: [string, string];
  /** Label of the undivided tax (e.g. IGST across states, or plain "GST"). */
  singleLabel: string;
}

/**
 * Tax on an invoice subtotal (M09-07): the total is rounded once; a split gives the first half rounded and the second
 * the remainder, so the parts always add up to the total.
 */
export function computeTaxLines(subtotal: string, setup: TaxSetup, intraState: boolean): TaxLine[] {
  if (dec(setup.rate).isZero()) return [];
  const total = percentOf(subtotal, setup.rate);
  if (setup.split && intraState) {
    const half = round2(total.dividedBy(2));
    const halfRate = dec(setup.rate).dividedBy(2).toString();
    return [
      { label: setup.splitLabels[0], rate: halfRate, amount: toMoney(half) },
      { label: setup.splitLabels[1], rate: halfRate, amount: toMoney(total.minus(half)) },
    ];
  }
  return [{ label: setup.singleLabel, rate: dec(setup.rate).toString(), amount: toMoney(total) }];
}

export type InvoiceStatusValue = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

/** Status of an issued invoice from what was settled (M09-09). */
export function statusAfterPayments(total: string, settled: string): InvoiceStatusValue {
  const paid = dec(settled);
  if (paid.greaterThanOrEqualTo(dec(total)) && dec(total).greaterThan(0)) return "PAID";
  if (paid.greaterThan(0)) return "PARTIALLY_PAID";
  return "ISSUED";
}

export const AGEING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

/** Receivables ageing (M09-10) by days since the invoice date (yyyy-MM-dd strings). */
export function ageingBucket(issueDate: string, today: string): AgeingBucket {
  const days = Math.floor(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${issueDate}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
