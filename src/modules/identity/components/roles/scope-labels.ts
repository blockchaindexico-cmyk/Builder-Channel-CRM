export type ScopeValue = "OWN" | "TEAM" | "ALL";

/** Data scope wording used in the roles editor (BUILD_PLAN §1.2). */
export const SCOPE_OPTIONS: { value: ScopeValue; label: string; description: string }[] = [
  { value: "OWN", label: "Own records", description: "only records assigned to the person" },
  {
    value: "TEAM",
    label: "Team records",
    description: "their own plus their reporting team's records",
  },
  { value: "ALL", label: "All records", description: "every record in the organization" },
];
