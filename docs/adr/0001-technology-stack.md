# ADR 0001 — Technology stack

- **Status:** Accepted (2026-09-24)
- **Related:** BUILD_PLAN §2.1, decisions D-002 and D-004 → D-008 in PROGRESS.md

## Context

The product owner chose Next.js. The CRM is a data-heavy, form-heavy internal business application for one
organization today and many later. It needs strong relational integrity, auditable changes, background processing
(reminders, e-mails, imports) and a service layer that a future mobile API can reuse.

## Decision

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Architecture | Modular monolith: `src/modules/*` over a shared `src/platform` core; transport-agnostic services |
| Database | PostgreSQL 16+ with Prisma 7 (multi-file schema, pg driver adapter) |
| Mutations | Server Actions via next-safe-action (auth → tenant → permission → validation middleware) |
| Background jobs | pg-boss in a separate worker process (no Redis) |
| UI | Tailwind CSS v4, shadcn-style components on Radix UI, TanStack Table, nuqs for URL state |
| Validation | Zod schemas shared by forms and services |
| Auth (M02) | Better Auth with database sessions |
| Files / e-mail | S3-compatible storage with presigned URLs; SMTP/Resend via nodemailer + React Email |
| Testing | Vitest (unit + integration on real PostgreSQL), Playwright (E2E) |

`cacheComponents` is **not** enabled: almost every screen is per-user, permission-filtered, dynamic data, and the
required Suspense boundaries would add complexity without benefit. It can be revisited for dashboards (M10).

## Consequences

- One deployable web app plus one worker, both built from the same codebase and Docker file.
- PostgreSQL is the only stateful dependency besides object storage (jobs, events, sessions all live in it).
- Business logic lives in services that take a `ServiceContext`, so a REST API for the mobile app (phase F2) can call
  the same functions.
