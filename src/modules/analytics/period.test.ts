import { describe, expect, it } from "vitest";

import { bucketsOf, changePercent, defaultGranularity, previousPeriod } from "./period";

describe("report periods", () => {
  it("compares with the period of the same length just before", () => {
    expect(previousPeriod({ from: "2026-09-01", to: "2026-09-30" })).toEqual({
      from: "2026-08-02",
      to: "2026-08-31",
    });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-01" })).toEqual({
      from: "2026-02-28",
      to: "2026-02-28",
    });
  });

  it("splits a range into clipped week and month buckets, empty ones included", () => {
    const weeks = bucketsOf({ from: "2026-09-02", to: "2026-09-15" }, "week");
    expect(weeks.map((bucket) => [bucket.key, bucket.from, bucket.to])).toEqual([
      ["2026-08-31", "2026-09-02", "2026-09-06"],
      ["2026-09-07", "2026-09-07", "2026-09-13"],
      ["2026-09-14", "2026-09-14", "2026-09-15"],
    ]);
    const months = bucketsOf({ from: "2026-01-15", to: "2026-03-02" }, "month");
    expect(months.map((bucket) => bucket.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(bucketsOf({ from: "2026-09-01", to: "2026-09-03" }, "day")).toHaveLength(3);
  });

  it("chooses bucket sizes and computes changes", () => {
    expect(defaultGranularity({ from: "2026-09-01", to: "2026-09-30" })).toBe("day");
    expect(defaultGranularity({ from: "2026-04-01", to: "2026-09-30" })).toBe("week");
    expect(defaultGranularity({ from: "2025-10-01", to: "2026-09-30" })).toBe("month");
    expect(changePercent(15, 10)).toBe(50);
    expect(changePercent(0, 0)).toBe(0);
    expect(changePercent(3, 0)).toBeNull();
  });
});
