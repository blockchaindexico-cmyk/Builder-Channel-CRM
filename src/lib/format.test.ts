import { describe, expect, it } from "vitest";

import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMonthYear,
  formatNumber,
  formatRelative,
  formatTime,
  toCalendarDateString,
} from "./format";

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
    expect(formatMoney("16500000", india, { compact: true })).toMatch(/₹1\.65\s?Cr/);
    expect(formatMoney("9250000", india, { compact: true })).toMatch(/₹92\.5\s?L/);
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

describe("calendar dates", () => {
  it("formats date-only values without timezone shifts", () => {
    expect(formatCalendarDate("2027-12-01", { dateFormat: "dd MMM yyyy" })).toBe("01 Dec 2027");
    expect(formatCalendarDate("2027-12-01", { dateFormat: "dd/MM/yyyy" })).toBe("01/12/2027");
    expect(formatMonthYear("2027-12-01")).toBe("Dec 2027");
    expect(formatCalendarDate(null, { dateFormat: "dd MMM yyyy" })).toBe("—");
    expect(formatMonthYear("not a date")).toBe("—");
  });

  it("reads database dates stored at UTC midnight", () => {
    expect(toCalendarDateString(new Date("2027-12-01T00:00:00.000Z"))).toBe("2027-12-01");
    expect(toCalendarDateString(null)).toBeNull();
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");

  it("says just now within the first 45 seconds", () => {
    expect(formatRelative("2026-09-25T09:59:30.000Z", now)).toBe("just now");
    expect(formatRelative("2026-09-25T10:00:10.000Z", now)).toBe("just now");
  });

  it("describes past and future distances", () => {
    expect(formatRelative("2026-09-25T09:55:00.000Z", now)).toBe("5 minutes ago");
    expect(formatRelative("2026-09-27T10:00:00.000Z", now)).toBe("in 2 days");
    expect(formatRelative(null, now)).toBe("—");
  });
});
