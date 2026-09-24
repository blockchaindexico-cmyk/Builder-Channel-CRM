# ADR 0002 — Multi-tenancy: shared schema with tenant-scoped data access

- **Status:** Accepted (2026-09-24)
- **Related:** BUILD_PLAN §2.4 (rules T1–T10), decision D-003

## Context

The CRM serves one channel-partner organization now, but must become multi-tenant (SaaS) later **without a data
migration or a rewrite of the feature modules**.

## Decision

1. **Shared database, shared schema, tenant column.** Every tenant-owned table has `organization_id` (T1); unique
   constraints are per organization (T2); child tables reference tenant parents through composite keys
   `(organization_id, parent_id)` so rows can never point at another tenant's data.
2. **Tenant-scoped client.** Feature code never uses the raw Prisma client (T3, enforced by ESLint). It uses
   `ctx.db` — a Prisma client extension (`src/platform/db/tenant-scope.ts`) that adds `organizationId` to every
   `where`, fills it on `create`, refuses queries naming another tenant, forbids moving rows between tenants and limits
   the `Organization` model to the current tenant. The list of tenant models is derived from the generated client.
3. **Tenant from the session only** (T4). In single-tenant bootstrap mode (M01) it comes from
   `DEFAULT_ORGANIZATION_SLUG`; from M02 from the signed-in user's membership; later (F1) from the subdomain.
4. **Global users, per-org memberships** (T5), per-org settings (T6), per-org sequences (T7), tenant-prefixed file keys
   (T8), `organizationId` on every job/event/log (T9).
5. **Isolation tests** with two organizations accompany every tenant-owned feature (T10) —
   see `tests/integration/tenant-scope.test.ts`.

## Consequences

- Switching on multi-tenancy (F1) is about tenant resolution, onboarding and billing — not data changes.
- Raw SQL bypasses the extension; it must filter by `organization_id` explicitly and be covered by tests.
- PostgreSQL Row-Level Security can be added later as defense-in-depth (`SET app.current_org` per transaction).
