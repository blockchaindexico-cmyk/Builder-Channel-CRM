import { describe, expect, it } from "vitest";

import {
  formatDateRangeLabel,
  fromZonedInputValue,
  isIsoDate,
  presetRange,
  toUtcBounds,
  toZonedInputValue,
  zonedClock,
} from "./date-range";

// 2026-09-24T20:30:00Z is already 25 Sep (02:00) in India.
const now = new Date("2026-09-24T20:30:00Z");

describe("date ranges", () => {
  it("resolves presets in the organization's timezone", () => {
    expect(presetRange("today", { timezone: "Asia/Kolkata", now })).toEqual({
      from: "2026-09-25",
      to: "2026-09-25",
    });
    expect(presetRange("today", { timezone: "UTC", now })).toEqual({
      from: "2026-09-24",
      to: "2026-09-24",
    });
    expect(presetRange("yesterday", { timezone: "Asia/Kolkata", now })).toEqual({
      from: "2026-09-24",
      to: "2026-09-24",
    });
    // 25 Sep 2026 is a Friday; weeks start on Monday.
    expect(presetRange("this_week", { timezone: "Asia/Kolkata", now })).toEqual({
      from: "2026-09-21",
      to: "2026-09-27",
    });
    expect(presetRange("this_month", { timezone: "Asia/Kolkata", now })).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("last_7_days", { timezone: "Asia/Kolkata", now })).toEqual({
      from: "2026-09-19",
      to: "2026-09-25",
    });
  });

  it("converts calendar dates to half-open UTC bounds", () => {
    const bounds = toUtcBounds({ from: "2026-09-25", to: "2026-09-25" }, "Asia/Kolkata");
    expect(bounds.gte.toISOString()).toBe("2026-09-24T18:30:00.000Z");
    expect(bounds.lt.toISOString()).toBe("2026-09-25T18:30:00.000Z");
    const month = toUtcBounds({ from: "2026-09-01", to: "2026-09-30" }, "UTC");
    expect(month.gte.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(month.lt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("validates and labels dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
    expect(formatDateRangeLabel({ from: "2026-09-01", to: "2026-09-30" })).toBe(
      "01 Sep 2026 – 30 Sep 2026",
    );
    expect(formatDateRangeLabel({ from: "2026-09-05", to: "2026-09-05" })).toBe("05 Sep 2026");
  });
});

describe("zoned clock and datetime inputs", () => {
  it("reads the local date and time of an instant", () => {
    expect(zonedClock(new Date("2026-03-10T02:59:00Z"), "Asia/Kolkata")).toEqual({
      date: "2026-03-10",
      time: "08:29",
    });
    expect(zonedClock(new Date("2026-03-10T02:59:00Z"), "America/New_York")).toEqual({
      date: "2026-03-09",
      time: "22:59",
    });
  });

  it("round-trips datetime-local values through the organization's time zone", () => {
    expect(toZonedInputValue("2026-09-25T04:30:00Z", "Asia/Kolkata")).toBe("2026-09-25T10:00");
    expect(fromZonedInputValue("2026-09-25T10:00", "Asia/Kolkata")).toBe(
      "2026-09-25T04:30:00.000Z",
    );
    expect(fromZonedInputValue("2026-07-01T08:30", "America/New_York")).toBe(
      "2026-07-01T12:30:00.000Z",
    );
    expect(toZonedInputValue(null, "Asia/Kolkata")).toBe("");
    expect(fromZonedInputValue("", "Asia/Kolkata")).toBeNull();
  });
});
