import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/platform/errors";

import { PermissionSet } from "./permissions";

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
    expect(PermissionSet.none().has("leads.view")).toBe(false);
  });
});
