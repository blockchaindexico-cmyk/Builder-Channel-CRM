import type { PermissionSet } from "@/platform/rbac/permissions";

import type {
  ContributionMap,
  ModuleManifest,
  NavItem,
  NavSection,
  PermissionDefinition,
  SettingsGroup,
  SettingsSection,
} from "./types";

type PermissionChecker = Pick<PermissionSet, "has"> | { has(permission: string): boolean };

const NAV_SECTION_ORDER: readonly NavSection[] = ["main", "workspace", "insights", "admin"];
const SETTINGS_GROUP_ORDER: readonly SettingsGroup[] = [
  "Organization",
  "Users & access",
  "Sales setup",
  "Finance",
  "System",
];

function assertUnique(values: readonly string[], what: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${what} "${value}" in module manifests.`);
    seen.add(value);
  }
}

/** Builds the query helpers used by the UI from the list of module manifests. */
export function composeRegistry(manifests: readonly ModuleManifest[]) {
  assertUnique(
    manifests.map((m) => m.key),
    "module key",
  );
  const navItems = manifests.flatMap((m) => m.nav ?? []);
  const settingsSections = manifests.flatMap((m) => m.settings ?? []);
  const permissions = manifests.flatMap((m) => m.permissions ?? []);
  assertUnique(
    navItems.map((n) => n.key),
    "navigation key",
  );
  assertUnique(
    settingsSections.map((s) => s.key),
    "settings section key",
  );
  assertUnique(
    permissions.map((p) => p.key),
    "permission key",
  );

  return {
    manifests,

    /** Navigation items visible to the holder of `permissions`, grouped by section in display order. */
    navigation(access: PermissionChecker): { section: NavSection; items: NavItem[] }[] {
      return NAV_SECTION_ORDER.map((section) => ({
        section,
        items: navItems
          .filter(
            (item) => item.section === section && (!item.permission || access.has(item.permission)),
          )
          .sort((a, b) => a.order - b.order),
      })).filter((group) => group.items.length > 0);
    },

    /** Settings sections visible to the holder of `permissions`, grouped in display order. */
    settings(access: PermissionChecker): { group: SettingsGroup; sections: SettingsSection[] }[] {
      return SETTINGS_GROUP_ORDER.map((group) => ({
        group,
        sections: settingsSections
          .filter((s) => s.group === group && (!s.permission || access.has(s.permission)))
          .sort((a, b) => a.order - b.order),
      })).filter((group) => group.sections.length > 0);
    },

    /** Full permission catalogue (used by the roles editor in M02). */
    permissionCatalogue(): readonly PermissionDefinition[] {
      return permissions;
    },

    /** Items contributed to an extension point by all modules. */
    contributions<Point extends keyof ContributionMap>(
      point: Point,
    ): readonly ContributionMap[Point][] {
      return manifests.flatMap(
        (m) => (m.contributions?.[point] ?? []) as readonly ContributionMap[Point][],
      );
    },
  };
}

export type AppRegistry = ReturnType<typeof composeRegistry>;
