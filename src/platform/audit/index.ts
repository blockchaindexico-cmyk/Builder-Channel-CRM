import { Prisma } from "@/generated/prisma/client";
import type { TenantDbOrTx } from "@/platform/db/tenant-scope";
import type { ServiceContext } from "@/platform/tenant/context";

import { type ChangeSet, diffRecords } from "./diff";

export { type ChangeSet, diffRecords, type FieldChange, hasChanges } from "./diff";

export interface AuditEntryInput {
  /** Dotted action key, e.g. `organization.settings.update`, `lead.reassign`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Human readable one-liner shown in the audit viewer. */
  summary?: string;
  /** Either pass explicit changes, or `before`/`after` snapshots to diff. */
  changes?: ChangeSet;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Restrict the diff to these fields. */
  fields?: readonly string[];
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit log entry (PRD §28, BUILD_PLAN §2.6). Call it with the transaction client of the change it
 * describes so the entry commits or rolls back together with the change.
 */
export async function recordAudit(db: TenantDbOrTx, ctx: ServiceContext, input: AuditEntryInput) {
  const changes =
    input.changes ??
    (input.before !== undefined || input.after !== undefined
      ? diffRecords(input.before, input.after, { only: input.fields })
      : undefined);

  return db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      changes:
        changes && Object.keys(changes).length > 0
          ? (changes as Prisma.InputJsonValue)
          : Prisma.DbNull,
      metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    },
  });
}
