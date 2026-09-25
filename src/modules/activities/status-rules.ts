/**
 * Status automation after a call (M07-07), shared by the call dialog (to pre-select the suggestion) and the server
 * (calls reported without a person): the outcome's mapped status first, then "first time reached → Contacted",
 * then "N unanswered calls in a row → Unresponsive". Only leads that are still being worked on (open or in
 * progress, before the site-visit stage) are changed automatically.
 */
export interface StatusRuleLead {
  statusKey: string;
  statusCategory: string;
  isTerminal: boolean;
  /** Unanswered calls in a row before this call. */
  callAttempts: number;
}

export interface StatusRuleOutcome {
  connected: boolean;
  suggestedStatusKey: string | null;
}

const UNTOUCHED = ["NEW", "ASSIGNED"];
const VISIT_STAGE = ["VISIT", "REVISIT"];

export function isAutomatable(
  lead: Pick<StatusRuleLead, "statusKey" | "statusCategory" | "isTerminal">,
) {
  return (
    !lead.isTerminal &&
    (lead.statusCategory === "OPEN" || lead.statusCategory === "ACTIVE") &&
    !VISIT_STAGE.includes(lead.statusKey)
  );
}

export function suggestStatusAfterCall(
  lead: StatusRuleLead,
  outcome: StatusRuleOutcome,
  unresponsiveAfterAttempts: number,
): string | null {
  if (!isAutomatable(lead)) return null;
  const pick = (key: string) => (key === lead.statusKey ? null : key);
  if (outcome.suggestedStatusKey) return pick(outcome.suggestedStatusKey);
  if (outcome.connected) return UNTOUCHED.includes(lead.statusKey) ? "CONTACTED" : null;
  if (lead.callAttempts + 1 >= unresponsiveAfterAttempts) return pick("UNRESPONSIVE");
  return null;
}
