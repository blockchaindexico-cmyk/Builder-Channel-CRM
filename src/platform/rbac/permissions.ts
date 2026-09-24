import { ForbiddenError } from "@/platform/errors";

/** Wildcard permission granted in single-tenant bootstrap mode (M01) and to super users. */
export const ALL_PERMISSIONS = "*";

/**
 * The set of permission keys held by the current actor.
 * Keys are declared by modules in their manifests (e.g. `leads.view`, `settings.organization.manage`).
 * Real role-based permissions arrive with M02; until then the bootstrap context holds the wildcard.
 */
export class PermissionSet {
  private readonly keys: ReadonlySet<string>;

  constructor(keys: Iterable<string>) {
    this.keys = new Set(keys);
  }

  static all(): PermissionSet {
    return new PermissionSet([ALL_PERMISSIONS]);
  }

  static none(): PermissionSet {
    return new PermissionSet([]);
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

  toArray(): string[] {
    return [...this.keys].sort();
  }
}
