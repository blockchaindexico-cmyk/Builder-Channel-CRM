import type { LucideIcon } from "lucide-react";

/**
 * Client-safe module manifest (M01-21). Every module exports one from `src/modules/<name>/manifest.ts`;
 * the composition root `src/modules/registry.ts` lists them. Shared UI (navigation, settings menu,
 * permission catalogue, extension points) is derived from these manifests, so a module plugs into the app
 * without editing other modules.
 */

export type NavSection = "main" | "workspace" | "insights" | "admin";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: NavSection;
  order: number;
  /** Shown only when the user holds this permission. */
  permission?: string;
  /** Extra route prefixes that should highlight this item. */
  match?: readonly string[];
}

export type SettingsGroup =
  "Organization" | "Users & access" | "Sales setup" | "Finance" | "System";

export interface SettingsSection {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  group: SettingsGroup;
  order: number;
  permission?: string;
}

export type SystemRoleKey = "admin" | "manager" | "executive";

export interface PermissionDefinition {
  /** Dotted key, e.g. `leads.view`. */
  key: string;
  label: string;
  description?: string;
  /** Grouping in the roles editor (M02), usually the module name. */
  group: string;
  /** Record-level permissions support OWN / TEAM / ALL data scopes (M02). */
  scoped?: boolean;
  /**
   * Default grants for the system roles (BUILD_PLAN §1.2). Admin always receives every permission (scope ALL);
   * list `manager` / `executive` here with a scope (scoped permissions) or `true` (plain permissions).
   * Defaults are applied once per role when the permission first appears; admins can change them afterwards.
   */
  defaults?: Partial<Record<Exclude<SystemRoleKey, "admin">, "OWN" | "TEAM" | "ALL" | true>>;
}

/**
 * Extension points declared by modules through declaration merging, e.g. in M04:
 * `declare module "@/platform/registry/types" { interface ContributionMap { "lead.detail.panel": LeadPanel } }`.
 * Later modules contribute items for those points in their manifest.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ContributionMap {}

export type Contributions = {
  [Point in keyof ContributionMap]?: readonly ContributionMap[Point][];
};

export interface ModuleManifest {
  /** Stable key, e.g. `leads`. */
  key: string;
  /** Build-plan module id, e.g. `M04`. */
  planId: string;
  name: string;
  nav?: readonly NavItem[];
  settings?: readonly SettingsSection[];
  permissions?: readonly PermissionDefinition[];
  contributions?: Contributions;
}
