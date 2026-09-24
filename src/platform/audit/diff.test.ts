import { describe, expect, it } from "vitest";

import { diffRecords, hasChanges } from "./diff";

describe("diffRecords", () => {
  it("reports changed fields only", () => {
    const changes = diffRecords({ a: 1, b: "x", c: null }, { a: 2, b: "x", c: null });
    expect(changes).toEqual({ a: { from: 1, to: 2 } });
    expect(hasChanges(changes)).toBe(true);
  });

  it("treats undefined and null as equal and normalizes dates", () => {
    const when = new Date("2026-01-01T00:00:00Z");
    expect(diffRecords({ a: undefined, d: when }, { a: null, d: new Date(when) })).toEqual({});
    expect(diffRecords({ d: when }, { d: new Date("2026-01-02T00:00:00Z") })).toEqual({
      d: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" },
    });
  });

  it("ignores timestamps, supports allow-lists and redacts secrets", () => {
    const changes = diffRecords(
      { name: "A", updatedAt: new Date(0), passwordHash: "x", note: "n" },
      { name: "B", updatedAt: new Date(), passwordHash: "y", note: "m" },
      { ignore: ["note"] },
    );
    expect(changes).toEqual({
      name: { from: "A", to: "B" },
      passwordHash: { from: "[redacted]", to: "[redacted]" },
    });
    expect(diffRecords({ a: 1, b: 1 }, { a: 2, b: 2 }, { only: ["b"] })).toEqual({
      b: { from: 1, to: 2 },
    });
  });

  it("compares objects structurally", () => {
    expect(diffRecords({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toEqual({});
    expect(diffRecords({ tags: ["a"] }, { tags: ["a", "b"] })).toEqual({
      tags: { from: ["a"], to: ["a", "b"] },
    });
  });
});
