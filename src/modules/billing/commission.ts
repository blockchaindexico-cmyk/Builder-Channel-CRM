import { dec, percentOf, toMoney } from "./money";

/**
 * Commission from a builder's or project's rate card (M09-04, M09-05) — pure, so it is unit tested and shared by the
 * services. Slabs apply their percentage to the whole agreement value (not marginally).
 */
export type CommissionType = "PERCENTAGE" | "FLAT" | "SLAB";
export type SlabBasis = "VALUE" | "VOLUME";

export interface CommissionSlab {
  /** Lower bound (inclusive): an amount for VALUE slabs, a deal count for VOLUME slabs. */
  from: string;
  /** Upper bound (exclusive for VALUE, inclusive for VOLUME); null = no limit. */
  to: string | null;
  percentage: string;
}

export interface CommissionCard {
  id: string;
  builderId: string;
  projectId: string | null;
  name: string | null;
  type: CommissionType;
  percentage: string | null;
  flatAmount: string | null;
  slabBasis: SlabBasis | null;
  slabs: CommissionSlab[];
  /** yyyy-MM-dd */
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
}

/** The card for a deal on a date: the project's own card first, then the builder's; the latest start wins. */
export function pickCommissionCard(
  cards: readonly CommissionCard[],
  deal: { builderId: string; projectId: string; date: string },
): CommissionCard | null {
  const valid = cards.filter(
    (card) =>
      card.isActive &&
      card.builderId === deal.builderId &&
      card.validFrom <= deal.date &&
      (card.validTo === null || deal.date <= card.validTo),
  );
  const latest = (list: CommissionCard[]) =>
    list.toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
  return (
    latest(valid.filter((card) => card.projectId === deal.projectId)) ??
    latest(valid.filter((card) => card.projectId === null))
  );
}

export interface CommissionResult {
  gross: string;
  /** Effective percentage of the agreement value (null for flat amounts or when nothing applies). */
  rate: string | null;
  basis: string;
}

const label = (card: CommissionCard) => (card.name ? ` (${card.name})` : "");

/**
 * Works out the commission. `volumePosition` is the deal's rank among the builder's (or project's) closed deals of
 * the fiscal year, this one included — needed for VOLUME slabs.
 */
export function computeCommission(
  card: CommissionCard | null,
  deal: { agreementValue: string | null; volumePosition?: number },
  formatAmount: (value: string) => string = (value) => value,
): CommissionResult {
  if (!card) return { gross: "0.00", rate: null, basis: "No rate card applies to this deal" };
  if (card.type === "FLAT") {
    return {
      gross: toMoney(card.flatAmount),
      rate: null,
      basis: `Flat ${formatAmount(toMoney(card.flatAmount))} per deal${label(card)}`,
    };
  }
  const value = deal.agreementValue;
  const hasValue = value !== null && dec(value).greaterThan(0);
  if (card.type === "PERCENTAGE") {
    const rate = dec(card.percentage).toString();
    if (!hasValue) {
      return { gross: "0.00", rate, basis: `${rate}% — the agreement value is not entered yet` };
    }
    return {
      gross: toMoney(percentOf(value, card.percentage)),
      rate,
      basis: `${rate}% of the agreement value${label(card)}`,
    };
  }
  // Slabs.
  if (card.slabBasis === "VOLUME") {
    const position = deal.volumePosition ?? 1;
    const slab = card.slabs.find(
      (entry) =>
        dec(entry.from).lessThanOrEqualTo(position) &&
        (entry.to === null || dec(entry.to).greaterThanOrEqualTo(position)),
    );
    if (!slab)
      return { gross: "0.00", rate: null, basis: `No slab for deal ${position} of the year` };
    const rate = dec(slab.percentage).toString();
    if (!hasValue) {
      return { gross: "0.00", rate, basis: `${rate}% — the agreement value is not entered yet` };
    }
    return {
      gross: toMoney(percentOf(value, slab.percentage)),
      rate,
      basis: `${rate}% — deal ${position} of the fiscal year${label(card)}`,
    };
  }
  if (!hasValue)
    return { gross: "0.00", rate: null, basis: "The agreement value is not entered yet" };
  const slab = card.slabs.find(
    (entry) =>
      dec(entry.from).lessThanOrEqualTo(value) &&
      (entry.to === null || dec(entry.to).greaterThan(value)),
  );
  if (!slab) return { gross: "0.00", rate: null, basis: "No slab covers this agreement value" };
  const rate = dec(slab.percentage).toString();
  return {
    gross: toMoney(percentOf(value, slab.percentage)),
    rate,
    basis: `${rate}% — value slab from ${formatAmount(toMoney(slab.from))}${
      slab.to ? ` to ${formatAmount(toMoney(slab.to))}` : " up"
    }${label(card)}`,
  };
}

/** Checks a card's own consistency; returns an error per field (empty when fine). */
export function validateCommissionCard(card: {
  type: CommissionType;
  percentage: string | null;
  flatAmount: string | null;
  slabBasis: SlabBasis | null;
  slabs: CommissionSlab[];
  validFrom: string;
  validTo: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (card.validTo && card.validTo < card.validFrom) errors.validTo = "Ends before it starts";
  if (card.type === "PERCENTAGE") {
    if (
      !card.percentage ||
      !dec(card.percentage).greaterThan(0) ||
      dec(card.percentage).greaterThan(100)
    ) {
      errors.percentage = "Enter a percentage above 0 and up to 100";
    }
  }
  if (card.type === "FLAT" && (!card.flatAmount || !dec(card.flatAmount).greaterThan(0))) {
    errors.flatAmount = "Enter the amount per deal";
  }
  if (card.type === "SLAB") {
    if (!card.slabBasis) errors.slabBasis = "Choose what the slabs count";
    if (card.slabs.length === 0) errors.slabs = "Add at least one slab";
    let previousTo: string | null = null;
    card.slabs.forEach((slab, index) => {
      const pct = dec(slab.percentage);
      if (!pct.greaterThan(0) || pct.greaterThan(100))
        errors.slabs = `Slab ${index + 1}: percentage above 0 and up to 100`;
      if (slab.to !== null && !dec(slab.to).greaterThan(slab.from)) {
        errors.slabs = `Slab ${index + 1}: “to” must be above “from”`;
      }
      if (index > 0) {
        if (previousTo === null)
          errors.slabs = `Slab ${index}: only the last slab can be open-ended`;
        else if (dec(slab.from).lessThan(previousTo))
          errors.slabs = `Slab ${index + 1} overlaps the one before`;
      }
      previousTo = slab.to;
    });
  }
  return errors;
}
