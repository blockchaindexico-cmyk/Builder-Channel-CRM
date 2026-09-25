import { describe, expect, it } from "vitest";

import { compareDecimals, parseAmountInput } from "./decimal";

describe("compareDecimals", () => {
  it.each([
    ["1", "2", -1],
    ["10", "9", 1],
    ["10.50", "10.5", 0],
    ["0010", "10", 0],
    ["99999999999.99", "100000000000", -1],
    ["2.05", "2.5", -1],
    ["7500000", "7500000.00", 0],
  ] as const)("%s vs %s → %i", (a, b, expected) => {
    expect(compareDecimals(a, b)).toBe(expected);
  });

  it("rejects non-decimals", () => {
    expect(() => compareDecimals("-1", "2")).toThrow();
    expect(() => compareDecimals("1e3", "2")).toThrow();
  });
});

describe("parseAmountInput", () => {
  it.each([
    ["8500000", "8500000"],
    ["85,00,000", "8500000"],
    ["85 L", "8500000"],
    ["85L", "8500000"],
    ["92.5 lakh", "9250000"],
    ["1.25 Cr", "12500000"],
    ["1.2cr", "12000000"],
    ["₹ 2 crore", "20000000"],
    ["750k", "750000"],
    ["Rs. 45,000.50", "45000.5"],
    ["0.5", "0.5"],
    ["007", "7"],
  ])("%s → %s", (input, expected) => {
    expect(parseAmountInput(input)).toBe(expected);
  });

  it.each(["", "abc", "12 apples", "-5", "1.234", "1.2.3", "Cr"])("rejects %j", (input) => {
    expect(parseAmountInput(input)).toBeNull();
  });

  it("keeps sub-unit precision within the limit", () => {
    expect(parseAmountInput("1.23456 cr")).toBe("12345600");
    expect(parseAmountInput("1.234567891 cr")).toBe("12345678.91");
    expect(parseAmountInput("1.2345678912 cr")).toBeNull();
  });
});
