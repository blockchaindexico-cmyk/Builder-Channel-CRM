import { randomUUID } from "node:crypto";

import type { ActorType } from "@/generated/prisma/enums";
import { createTenantDb, type TenantDb } from "@/platform/db/tenant-scope";
import { PermissionSet } from "@/platform/rbac/permissions";

/** Who is performing an action. Recorded on audit logs, timeline entries and events. */
export interface Actor {
  type: ActorType;
  /** User id (USER), API key id (API_KEY) or null for SYSTEM. */
  id: string | null;
  /** Display name captured at the time of the action. */
  name: string;
  /** Membership id of a USER actor inside the current organization (M02). */
  membershipId?: string | null;
}

/**
 * Context passed to every service call (BUILD_PLAN §2.2 rule 2). Transport-agnostic: built from an HTTP
 * request (server actions, route handlers), a background job, or a test.
 */
export interface ServiceContext {
  /** Current tenant. Always derived from the session or job payload — never from user input (T4). */
  readonly organizationId: string;
  readonly actor: Actor;
  readonly permissions: PermissionSet;
  /** Correlates logs, audit entries and events produced by one request/job. */
  readonly requestId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /** Tenant-scoped database client (rule T3). */
  readonly db: TenantDb;
}

export interface CreateContextInput {
  organizationId: string;
  actor: Actor;
  permissions: PermissionSet;
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function createServiceContext(input: CreateContextInput): ServiceContext {
  return {
    organizationId: input.organizationId,
    actor: input.actor,
    permissions: input.permissions,
    requestId: input.requestId ?? randomUUID(),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    db: createTenantDb(input.organizationId),
  };
}

/** Context for background jobs and platform tasks acting on behalf of the system inside one tenant. */
export function createSystemContext(
  organizationId: string,
  options: { name?: string; requestId?: string } = {},
): ServiceContext {
  return createServiceContext({
    organizationId,
    actor: { type: "SYSTEM", id: null, name: options.name ?? "System" },
    permissions: PermissionSet.all(),
    requestId: options.requestId,
  });
}
