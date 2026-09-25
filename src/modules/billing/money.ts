import Decimal from "decimal.js";

/**
 * Decimal money helpers (BUILD_PLAN §2.6: money is never a float). Amounts travel as strings; every computed amount
 * is rounded to 2 decimals, half up, at the step it is computed.
 */
export type Amount = Decimal.Value | { toString(): string } | null | undefined;

export const dec = (value: Amount): Decimal =>
  new Decimal(value === null || value === undefined || value === "" ? 0 : value.toString());

export const round2 = (value: Decimal): Decimal => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** `rate` percent of `base`, rounded. */
export const percentOf = (base: Amount, rate: Amount): Decimal =>
  round2(dec(base).times(dec(rate)).dividedBy(100));

/** "1234.50" — the canonical string form of an amount. */
export const toMoney = (value: Amount): string => round2(dec(value)).toFixed(2);

export const sum = (values: Amount[]): Decimal =>
  values.reduce<Decimal>((total, value) => total.plus(dec(value)), new Decimal(0));

export const isZero = (value: Amount) => dec(value).isZero();
