import { Prisma } from "@/generated/prisma/client";
import { TenantViolationError } from "@/platform/errors";

import { prisma } from "./client";

/**
 * Tenant scoping (BUILD_PLAN §2.4, rules T1–T3).
 *
 * `createTenantDb(organizationId)` returns a Prisma client whose queries on tenant-owned models are
 * automatically constrained to one organization:
 *   - reads, updates and deletes get `organizationId = <tenant>` added to their `where`;
 *   - creates get `organizationId` filled in (and fail if a different tenant is given);
 *   - updates may never move a row to another tenant;
 *   - the `Organization` model itself is restricted to the current tenant's row.
 * Nested writes into child tables rely on composite foreign keys `(organizationId, parentId)`, which make
 * cross-tenant links impossible at the database level.
 */

/** Models that carry an `organizationId` column (derived from the generated client, so it stays in sync). */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((model) => {
    const scalarFields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
      `${model}ScalarFieldEnum`
    ];
    return Boolean(scalarFields && "organizationId" in scalarFields);
  }),
);

const ORGANIZATION_MODEL = Prisma.ModelName.Organization;

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
]);

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSameTenant(
  value: unknown,
  organizationId: string,
  model: string,
  location: string,
  field = "organizationId",
) {
  if (value === undefined) return;
  if (value !== organizationId) {
    throw new TenantViolationError(
      `${model}.${location}: ${field} must be the current tenant (got ${JSON.stringify(value)}).`,
    );
  }
}

function scopeWhere(
  where: unknown,
  organizationId: string,
  model: string,
  field: string,
): AnyRecord {
  const base = isRecord(where) ? where : {};
  assertSameTenant(base[field], organizationId, model, "where", field);
  return { ...base, [field]: organizationId };
}

function scopeCreateData(data: unknown, organizationId: string, model: string): AnyRecord {
  if (!isRecord(data)) {
    throw new TenantViolationError(`${model}: create data must be an object.`);
  }
  if ("organization" in data) {
    const relation = data.organization;
    const connectId =
      isRecord(relation) && isRecord(relation.connect) ? relation.connect.id : undefined;
    assertSameTenant(connectId, organizationId, model, "data.organization.connect");
    return data;
  }
  assertSameTenant(data.organizationId, organizationId, model, "data");
  return { ...data, organizationId };
}

function assertUpdateDoesNotMoveTenant(data: unknown, organizationId: string, model: string) {
  if (!isRecord(data)) return;
  if ("organizationId" in data) {
    assertSameTenant(data.organizationId, organizationId, model, "data");
  }
  if ("organization" in data) {
    throw new TenantViolationError(`${model}: the organization of a record cannot be changed.`);
  }
}

function scopeArgs(
  model: string,
  operation: string,
  args: unknown,
  organizationId: string,
): unknown {
  const input: AnyRecord = isRecord(args) ? { ...args } : {};

  if (model === ORGANIZATION_MODEL) {
    if (
      operation === "create" ||
      operation.startsWith("createMany") ||
      operation.startsWith("delete")
    ) {
      throw new TenantViolationError(
        `Organization.${operation} is not allowed through a tenant client.`,
      );
    }
    if (WHERE_OPERATIONS.has(operation)) {
      input.where = scopeWhere(input.where, organizationId, model, "id");
    }
    if (operation === "upsert") {
      throw new TenantViolationError("Organization.upsert is not allowed through a tenant client.");
    }
    return input;
  }

  if (WHERE_OPERATIONS.has(operation)) {
    input.where = scopeWhere(input.where, organizationId, model, "organizationId");
  }

  switch (operation) {
    case "create":
      input.data = scopeCreateData(input.data, organizationId, model);
      break;
    case "createMany":
    case "createManyAndReturn":
      input.data = Array.isArray(input.data)
        ? input.data.map((row) => scopeCreateData(row, organizationId, model))
        : scopeCreateData(input.data, organizationId, model);
      break;
    case "upsert":
      input.create = scopeCreateData(input.create, organizationId, model);
      assertUpdateDoesNotMoveTenant(input.update, organizationId, model);
      break;
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
      assertUpdateDoesNotMoveTenant(input.data, organizationId, model);
      break;
  }

  return input;
}

function tenantScopeExtension(organizationId: string) {
  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model !== ORGANIZATION_MODEL && !TENANT_MODELS.has(model)) {
            return query(args);
          }
          return query(scopeArgs(model, operation, args, organizationId) as typeof args);
        },
      },
    },
  });
}

function buildTenantDb(organizationId: string) {
  return prisma.$extends(tenantScopeExtension(organizationId));
}

/** Tenant-scoped Prisma client. Use `ctx.db` in services instead of creating one directly. */
export type TenantDb = ReturnType<typeof buildTenantDb>;

/** A tenant-scoped client or an interactive-transaction client obtained from it. */
export type TenantTx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

/** Either a tenant client or a transaction on it — accepted by helpers that can run inside or outside a transaction. */
export type TenantDbOrTx = TenantDb | TenantTx;

const clientCache = new Map<string, TenantDb>();
const MAX_CACHED_TENANTS = 200;

export function createTenantDb(organizationId: string): TenantDb {
  if (!organizationId) {
    throw new TenantViolationError("A tenant client requires an organizationId.");
  }
  const cached = clientCache.get(organizationId);
  if (cached) return cached;

  const client = buildTenantDb(organizationId);
  if (clientCache.size >= MAX_CACHED_TENANTS) {
    const oldest = clientCache.keys().next().value;
    if (oldest) clientCache.delete(oldest);
  }
  clientCache.set(organizationId, client);
  return client;
}
