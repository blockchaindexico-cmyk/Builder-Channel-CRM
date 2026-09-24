import { Home, Settings } from "lucide-react";
import { describe, expect, it } from "vitest";

import { PermissionSet } from "@/platform/rbac/permissions";

import { composeRegistry } from "./compose";
import type { ModuleManifest } from "./types";

const manifests: ModuleManifest[] = [
  {
    key: "a",
    planId: "M01",
    name: "A",
    nav: [
      { key: "home", label: "Home", href: "/", icon: Home, section: "main", order: 1 },
      {
        key: "admin",
        label: "Admin",
        href: "/admin",
        icon: Settings,
        section: "admin",
        order: 1,
        permission: "admin.view",
      },
    ],
    settings: [
      {
        key: "org",
        label: "Org",
        description: "",
        href: "/settings/org",
        icon: Settings,
        group: "Organization",
        order: 2,
        permission: "org.view",
      },
    ],
    permissions: [{ key: "admin.view", label: "View admin", group: "A" }],
  },
  {
    key: "b",
    planId: "M02",
    name: "B",
    nav: [{ key: "leads", label: "Leads", href: "/leads", icon: Home, section: "main", order: 0 }],
  },
];

describe("composeRegistry", () => {
  const registry = composeRegistry(manifests);

  it("filters and orders navigation by permission", () => {
    const limited = registry.navigation(new PermissionSet([]));
    expect(limited).toEqual([
      {
        section: "main",
        items: [
          expect.objectContaining({ key: "leads" }),
          expect.objectContaining({ key: "home" }),
        ],
      },
    ]);
    const full = registry.navigation(PermissionSet.all());
    expect(full.map((group) => group.section)).toEqual(["main", "admin"]);
  });

  it("filters settings sections by permission", () => {
    expect(registry.settings(new PermissionSet([]))).toEqual([]);
    expect(registry.settings(new PermissionSet(["org.view"]))[0]?.sections[0]?.key).toBe("org");
  });

  it("exposes the permission catalogue and rejects duplicates", () => {
    expect(registry.permissionCatalogue().map((p) => p.key)).toEqual(["admin.view"]);
    expect(() => composeRegistry([...manifests, { key: "a", planId: "M03", name: "dup" }])).toThrow(
      'Duplicate module key "a"',
    );
  });
});
