# CLAUDE.md

@AGENTS.md

Guidance for AI-assisted development sessions in this repository.

## Before starting work
- Read `BUILD_PLAN.md` (architecture, module scope, checklists) and `PROGRESS.md` (current status, open questions).
- Work on the **current module** only, in plan order (M01 → M10). Do not start a module whose open questions are unanswered unless the proposed default has been accepted.

## After every change
- Tick completed task IDs in `BUILD_PLAN.md`.
- Update `PROGRESS.md`: module status board, a new **Change Log** row (newest first), decisions and questions if any, and the header (last updated, current module, overall progress).
- Commit messages follow Conventional Commits with the module as scope and task IDs in the body, e.g. `feat(M04): lead list filters` + `Tasks: M04-12, M04-13`.

## Non-negotiable rules
- **Multi-tenancy (BUILD_PLAN §2.4, T1–T10):** every tenant-owned table has `organizationId`; unique constraints are per organization; feature code uses the tenant-scoped DB accessor, never the raw Prisma client; the tenant comes from the session, never from request input.
- **Module boundaries (BUILD_PLAN §2.2):** business logic lives in module services; modules interact only through their `index.ts` public API and domain events; extend other modules via registries, not by editing their internals.
- **Accountability:** important mutations write an audit log entry, and a lead timeline entry when a lead is involved, in the same transaction.
- **Authorization:** enforce permissions and data scope (OWN / TEAM / ALL) in services on the server; UI gating is only cosmetic.
- **Money** uses decimals, never floats. **Timestamps** are stored in UTC and displayed in the organization's timezone.
- The mobile application is out of scope; keep services transport-agnostic so a future API can reuse them.
