/**
 * Exact helpers for non-negative decimal strings (money, areas). Values stay strings end to end — no floating
 * point — and are stored in PostgreSQL `numeric` columns (BUILD_PLAN: money is decimal, never float).
 */

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

function split(value: string): [string, string] {
  const match = DECIMAL.exec(value);
  if (!match) throw new Error(`Not a non-negative decimal: "${value}"`);
  const integer = match[1]!.replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return [integer, fraction];
}

/** Compares two non-negative decimal strings: -1 when a < b, 0 when equal, 1 when a > b. */
export function compareDecimals(a: string, b: string): -1 | 0 | 1 {
  const [ai, af] = split(a);
  const [bi, bf] = split(b);
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const length = Math.max(af.length, bf.length);
  const ap = af.padEnd(length, "0");
  const bp = bf.padEnd(length, "0");
  if (ap === bp) return 0;
  return ap < bp ? -1 : 1;
}

/** Multiplies a decimal string by 10^places without rounding, e.g. ("1.25", 7) → "12500000". */
function shift(value: string, places: number): string {
  const [integer, fraction] = split(value);
  const digits = integer + fraction.padEnd(places, "0");
  const pointAt = integer.length + places;
  const whole = digits.slice(0, pointAt).replace(/^0+(?=\d)/, "") || "0";
  const rest = digits.slice(pointAt).replace(/0+$/, "");
  return rest ? `${whole}.${rest}` : whole;
}

const MULTIPLIERS: Record<string, number> = {
  k: 3,
  thousand: 3,
  l: 5,
  lac: 5,
  lacs: 5,
  lakh: 5,
  lakhs: 5,
  cr: 7,
  crore: 7,
  crores: 7,
};

/**
 * Parses an amount typed by a user: "8500000", "85,00,000", "85 L", "1.25 Cr", "750k", "₹ 92.5 lakh".
 * Returns a plain decimal string with at most `maxFractionDigits` decimals, or null when not a valid amount.
 */
export function parseAmountInput(input: string, maxFractionDigits = 2): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[₹$,\s]|rs\.?|inr/g, "");
  if (!cleaned) return null;
  const match = /^(\d+(?:\.\d+)?)([a-z]*)$/.exec(cleaned);
  if (!match) return null;
  const [, number, unit] = match;
  let value = number!;
  if (unit) {
    const places = MULTIPLIERS[unit];
    if (places === undefined) return null;
    value = shift(value, places);
  } else {
    value = shift(value, 0);
  }
  const [, fraction] = split(value);
  if (fraction.length > maxFractionDigits) return null;
  return value;
}
