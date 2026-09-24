# ADR 0003 — Domain events and background jobs on PostgreSQL

- **Status:** Accepted (2026-09-24)
- **Related:** BUILD_PLAN §2.2 rule 5, decisions D-007 and D-011

## Context

Modules must react to each other's changes (e.g. notify an executive when a lead is reassigned) without direct
coupling, and side effects must never be lost or triggered for changes that were rolled back.

## Decision

- **Transactional outbox with in-transaction fan-out.** `publishEvent(tx, ctx, type, payload)`
  (`src/platform/events/publish.ts`) writes an `outbox_events` row **and** enqueues one pg-boss job per subscribed
  handler (queue `evt.<handler>`) using the same transaction (`fromPrisma(tx)`). A rollback removes both; a commit
  guarantees delivery. No polling relay is needed.
- **Handlers** are declared in module server manifests (`defineEventHandler`), run in the worker with a system context
  for the event's organization, retry with backoff and must be idempotent.
- **Jobs** (`defineJob`) cover e-mail delivery, maintenance crons (outbox pruning, abandoned-upload cleanup) and later
  reminders, imports and exports. `enqueueJob(name, data, { tx })` enqueues transactionally when needed.
- The **worker** (`src/worker`) starts pg-boss with supervision and cron, registers all handlers and jobs, and writes a
  heartbeat reported by `/api/health`.
- Event types are typed through declaration merging on `DomainEventMap`.

## Consequences

- One infrastructure dependency (PostgreSQL) for data, jobs and events.
- The outbox table doubles as an auditable event log (Settings → System status) and is pruned after 90 days.
- Constants used at module top level in server manifests must live in leaf modules to avoid circular-import
  initialization issues (see `src/platform/email/constants.ts`).
