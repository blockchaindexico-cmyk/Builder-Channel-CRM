import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/platform/errors";

import { PermissionSet, widerScope } from "./permissions";

describe("PermissionSet", () => {
  it("checks explicit permissions", () => {
    const set = new PermissionSet(["leads.view", "leads.create"]);
    expect(set.has("leads.view")).toBe(true);
    expect(set.has("leads.delete")).toBe(false);
    expect(set.hasAny(["leads.delete", "leads.create"])).toBe(true);
    expect(() => set.assert("leads.delete")).toThrow(ForbiddenError);
    expect(set.toArray()).toEqual(["leads.create", "leads.view"]);
  });

  it("supports the wildcard and the empty set", () => {
    expect(PermissionSet.all().has("anything.at.all")).toBe(true);
    expect(PermissionSet.all().scope("leads.view")).toBe("ALL");
    expect(PermissionSet.none().has("leads.view")).toBe(false);
    expect(PermissionSet.none().scope("leads.view")).toBeNull();
  });

  it("resolves data scopes from role grants, keeping the widest", () => {
    const set = PermissionSet.fromGrants([
      { permission: "leads.view", scope: "OWN" },
      { permission: "leads.view", scope: "TEAM" },
      { permission: "users.manage", scope: null },
    ]);
    expect(set.scope("leads.view")).toBe("TEAM");
    expect(set.scope("users.manage")).toBe("ALL");
    expect(set.scope("reports.view")).toBeNull();
    expect(set.toJSON()).toEqual({
      keys: ["leads.view", "users.manage"],
      scopes: { "leads.view": "TEAM" },
    });
  });

  it("compares scopes", () => {
    expect(widerScope("OWN", "ALL")).toBe("ALL");
    expect(widerScope("TEAM", "OWN")).toBe("TEAM");
    expect(widerScope(null, "OWN")).toBe("OWN");
  });
});
