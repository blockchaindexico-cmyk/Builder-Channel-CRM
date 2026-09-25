import { describe, expect, it } from "vitest";

import { activeNavKey } from "./nav-links";

const items = [
  { key: "dashboard", href: "/dashboard" },
  { key: "leads", href: "/leads" },
  { key: "unassigned", href: "/leads/unassigned" },
  { key: "team", href: "/team" },
  { key: "workload", href: "/team/workload" },
  { key: "settings", href: "/settings", match: ["/profile"] },
];

describe("activeNavKey", () => {
  it("highlights the most specific matching item only", () => {
    expect(activeNavKey(items, "/leads")).toBe("leads");
    expect(activeNavKey(items, "/leads/0199-abc")).toBe("leads");
    expect(activeNavKey(items, "/leads/unassigned")).toBe("unassigned");
    expect(activeNavKey(items, "/team/workload")).toBe("workload");
    expect(activeNavKey(items, "/team")).toBe("team");
    expect(activeNavKey(items, "/profile")).toBe("settings");
    expect(activeNavKey(items, "/leadsx")).toBeNull();
  });
});
