import { describe, expect, it } from "vitest";

import { initials } from "./utils";

describe("initials", () => {
  it("uses the first letter of the first two words, skipping punctuation", () => {
    expect(initials("Asha Mehta")).toBe("AM");
    expect(initials("Setup (unauthenticated)")).toBe("SU");
    expect(initials("  ravi  ")).toBe("R");
    expect(initials("")).toBe("?");
  });
});
