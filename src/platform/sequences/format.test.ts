import { describe, expect, it } from "vitest";

import { formatSequenceNumber } from "./index";

describe("formatSequenceNumber", () => {
  it("pads and prefixes numbers", () => {
    expect(formatSequenceNumber("LD", 42)).toBe("LD-000042");
    expect(formatSequenceNumber("BK", 7, { padding: 4 })).toBe("BK-0007");
    expect(formatSequenceNumber("INV/2026-27", 12, { padding: 4, separator: "/" })).toBe(
      "INV/2026-27/0012",
    );
    expect(formatSequenceNumber("LD", 1234567)).toBe("LD-1234567");
  });
});
