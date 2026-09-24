import { ForbiddenError } from "@/platform/errors";

/** Wildcard permission (system contexts for background jobs and platform tasks). */
export const ALL_PERMISSIONS = "*";

/** Record-level data scope (BUILD_PLAN §2.5): own records, the reporting tree, or the whole organization. */
export type DataScopeValue = "OWN" | "TEAM" | "ALL";

const SCOPE_RANK: Record<DataScopeValue, number> = { OWN: 1, TEAM: 2, ALL: 3 };

/** The broader of two scopes (when a permission is granted more than once). */
export function widerScope(
  a: DataScopeValue | null | undefined,
  b: DataScopeValue | null | undefined,
) {
  if (!a) return b ?? null;
  if (!b) return a;
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/**
 * The permissions held by the current actor, with a data scope for record-level permissions.
 * Keys are declared by modules in their manifests (e.g. `leads.view`, `settings.organization.manage`).
 */
export class PermissionSet {
  private readonly keys: ReadonlySet<string>;
  private readonly scopes: ReadonlyMap<string, DataScopeValue>;

  constructor(keys: Iterable<string>, scopes?: Iterable<[string, DataScopeValue]>) {
    this.keys = new Set(keys);
    this.scopes = new Map(scopes ?? []);
  }

  static all(): PermissionSet {
    return new PermissionSet([ALL_PERMISSIONS]);
  }

  static none(): PermissionSet {
    return new PermissionSet([]);
  }

  /** Builds a set from role grants: `{ permission, scope }` rows (scope null for plain permissions). */
  static fromGrants(
    grants: Iterable<{ permission: string; scope: DataScopeValue | null }>,
  ): PermissionSet {
    const keys = new Set<string>();
    const scopes = new Map<string, DataScopeValue>();
    for (const grant of grants) {
      keys.add(grant.permission);
      if (grant.scope) {
        const wider = widerScope(scopes.get(grant.permission), grant.scope);
        if (wider) scopes.set(grant.permission, wider);
      }
    }
    return new PermissionSet(keys, scopes);
  }

  get isSuperuser(): boolean {
    return this.keys.has(ALL_PERMISSIONS);
  }

  has(permission: string): boolean {
    return this.keys.has(ALL_PERMISSIONS) || this.keys.has(permission);
  }

  hasAny(permissions: readonly string[]): boolean {
    return permissions.some((permission) => this.has(permission));
  }

  /** Throws `ForbiddenError` unless the permission is held. */
  assert(permission: string): void {
    if (!this.has(permission)) {
      throw new ForbiddenError(undefined, permission);
    }
  }

  /**
   * Data scope of a record-level permission: `null` when not held. A held permission without an explicit
   * scope — and the wildcard — mean `ALL`.
   */
  scope(permission: string): DataScopeValue | null {
    if (this.keys.has(ALL_PERMISSIONS)) return "ALL";
    if (!this.keys.has(permission)) return null;
    return this.scopes.get(permission) ?? "ALL";
  }

  toArray(): string[] {
    return [...this.keys].sort();
  }

  /** Serializable form (keys with scopes) for client components. */
  toJSON(): { keys: string[]; scopes: Record<string, DataScopeValue> } {
    return { keys: this.toArray(), scopes: Object.fromEntries(this.scopes) };
  }
}
