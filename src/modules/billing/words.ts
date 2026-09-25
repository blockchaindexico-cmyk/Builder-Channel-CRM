import { dec } from "./money";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(value: number): string {
  if (value < 20) return ONES[value]!;
  const rest = value % 10;
  return `${TENS[Math.floor(value / 10)]}${rest ? `-${ONES[rest]}` : ""}`;
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Whole number in words, Indian system (thousand, lakh, crore): 12,34,567 → "Twelve Lakh Thirty-Four Thousand…". */
export function numberInWords(value: number): string {
  if (value === 0) return "Zero";
  const parts: string[] = [];
  let rest = value;
  const crore = Math.floor(rest / 10_000_000);
  rest %= 10_000_000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/** "Rupees Two Lakh Ninety-Five Thousand and Fifty Paise Only" — for the amount line of an invoice. */
export function amountInWords(
  amount: string,
  currency = { major: "Rupees", minor: "Paise" },
): string {
  const value = dec(amount).toDecimalPlaces(2);
  const whole = value.floor().toNumber();
  const fraction = value.minus(value.floor()).times(100).toNumber();
  return `${currency.major} ${numberInWords(whole)}${
    fraction ? ` and ${belowHundred(fraction)} ${currency.minor}` : ""
  } Only`;
}
