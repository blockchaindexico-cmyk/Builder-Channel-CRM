import { describe, expect, it } from "vitest";

import { suggestStatusAfterCall } from "./status-rules";

const lead = (
  statusKey: string,
  extra: Partial<Parameters<typeof suggestStatusAfterCall>[0]> = {},
) => ({
  statusKey,
  statusCategory: ["NEW", "ASSIGNED"].includes(statusKey) ? "OPEN" : "ACTIVE",
  isTerminal: false,
  callAttempts: 0,
  ...extra,
});
const reached = { connected: true, suggestedStatusKey: null };
const unanswered = { connected: false, suggestedStatusKey: null };

describe("status suggestion after a call (M07-07)", () => {
  it("uses the outcome's status first", () => {
    expect(
      suggestStatusAfterCall(
        lead("ASSIGNED"),
        { connected: true, suggestedStatusKey: "POSITIVE" },
        3,
      ),
    ).toBe("POSITIVE");
    expect(
      suggestStatusAfterCall(
        lead("POSITIVE"),
        { connected: true, suggestedStatusKey: "POSITIVE" },
        3,
      ),
    ).toBeNull();
  });

  it("moves a new or assigned lead to Contacted the first time the customer is reached", () => {
    expect(suggestStatusAfterCall(lead("NEW"), reached, 3)).toBe("CONTACTED");
    expect(suggestStatusAfterCall(lead("ASSIGNED"), reached, 3)).toBe("CONTACTED");
    expect(suggestStatusAfterCall(lead("POSITIVE"), reached, 3)).toBeNull();
  });

  it("suggests Unresponsive after the configured number of unanswered calls in a row", () => {
    expect(suggestStatusAfterCall(lead("ASSIGNED", { callAttempts: 1 }), unanswered, 3)).toBeNull();
    expect(suggestStatusAfterCall(lead("ASSIGNED", { callAttempts: 2 }), unanswered, 3)).toBe(
      "UNRESPONSIVE",
    );
    expect(
      suggestStatusAfterCall(lead("UNRESPONSIVE", { callAttempts: 5 }), unanswered, 3),
    ).toBeNull();
  });

  it("never touches closed leads or leads in the visit and booking stages", () => {
    const outcome = { connected: false, suggestedStatusKey: "INVALID" };
    expect(
      suggestStatusAfterCall(
        lead("LOST", { isTerminal: true, statusCategory: "LOST" }),
        outcome,
        3,
      ),
    ).toBeNull();
    expect(suggestStatusAfterCall(lead("VISIT", { callAttempts: 9 }), unanswered, 3)).toBeNull();
    expect(
      suggestStatusAfterCall(
        lead("BOOKING", { statusCategory: "BOOKING", callAttempts: 9 }),
        unanswered,
        3,
      ),
    ).toBeNull();
  });
});
