import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatMoney, formatNumber, formatTime } from "./format";

const india = {
  timezone: "Asia/Kolkata",
  currency: "INR",
  locale: "en-IN",
  dateFormat: "dd MMM yyyy",
};
const us = {
  timezone: "America/New_York",
  currency: "USD",
  locale: "en-US",
  dateFormat: "MM/dd/yyyy",
};

describe("regional formatting", () => {
  it("formats money with the organization's currency and grouping", () => {
    expect(formatMoney(1234567, india)).toBe("₹12,34,567");
    expect(formatMoney("1234567.5", us, { decimals: 2 })).toBe("$1,234,567.50");
    expect(formatMoney(null, india)).toBe("—");
    expect(formatMoney(25000000, india, { compact: true })).toMatch(/₹2\.5\s?Cr/);
  });

  it("formats numbers with locale grouping", () => {
    expect(formatNumber(1234567, india)).toBe("12,34,567");
    expect(formatNumber(1234567, us)).toBe("1,234,567");
  });

  it("formats UTC timestamps in the organization's timezone", () => {
    const utc = "2026-09-24T20:30:00Z"; // 02:00 next day in India, 16:30 same day in New York
    expect(formatDate(utc, india)).toBe("25 Sep 2026");
    expect(formatDate(utc, us)).toBe("09/24/2026");
    expect(formatDateTime(utc, india)).toBe("25 Sep 2026, 2:00 AM");
    expect(formatTime(utc, us)).toBe("4:30 PM");
    expect(formatDate(undefined, india)).toBe("—");
  });
});
