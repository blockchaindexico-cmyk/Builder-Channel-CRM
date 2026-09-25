import { describe, expect, it } from "vitest";

import { initials, plural } from "./utils";

describe("initials", () => {
  it("uses the first letter of the first two words, skipping punctuation", () => {
    expect(initials("Asha Mehta")).toBe("AM");
    expect(initials("Setup (unauthenticated)")).toBe("SU");
    expect(initials("  ravi  ")).toBe("R");
    expect(initials("")).toBe("?");
  });
});

describe("plural", () => {
  it("picks the singular or plural noun", () => {
    expect(plural(1, "lead")).toBe("1 lead");
    expect(plural(0, "lead")).toBe("0 leads");
    expect(plural(3, "status", "statuses")).toBe("3 statuses");
  });
});
