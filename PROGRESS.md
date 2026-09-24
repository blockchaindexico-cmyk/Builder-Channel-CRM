# Builder Channel CRM — Progress Tracker

This file records **what has changed and what is still pending**. The detailed task checklist lives in
[`BUILD_PLAN.md`](./BUILD_PLAN.md); this file is the high-level status board and history.

| | |
|---|---|
| **Last updated** | 2026-09-24 |
| **Current phase** | Building — Milestone A (Foundation) |
| **Current module** | **M01 — Project Foundation & Platform Core** (in progress) |
| **Overall progress** | 23 / 183 tasks (13%) |

**How to update (after every piece of work)**
1. Tick the finished task IDs in `BUILD_PLAN.md`.
2. Update the module row in the **Module Status Board** (status, done/total, dates).
3. Add an entry at the top of the **Change Log** (date, module, task IDs, summary, commit/PR).
4. Record any new decision in the **Decision Log** and any new question in **Open Questions**.
5. Update the header (last updated, current module, overall progress).

Status legend: ⬜ Not started · 🟨 In progress · ✅ Done · ⏸️ Blocked · 🔁 Needs rework

---

## 1. Module Status Board

| # | Module | Status | Tasks done / total | Started | Completed | Notes |
|---|---|---|---|---|---|---|
| M01 | Project Foundation & Platform Core | 🟨 In progress | 23 / 28 | 2026-09-24 | – | Proposed defaults for Q-13–Q-15 adopted provisionally |
| M02 | Identity, Access Control & Team Structure | ⬜ Not started | 0 / 21 | – | – | Needs Q-04 |
| M03 | Builder & Project Management | ⬜ Not started | 0 / 14 | – | – | |
| M04 | Lead Management Core | ⬜ Not started | 0 / 23 | – | – | Needs Q-01, Q-02, Q-03, Q-05 |
| M05 | Lead Assignment, Reassignment & Team Workload | ⬜ Not started | 0 / 13 | – | – | Needs Q-06, Q-08 |
| M06 | Notifications & Reminders Engine | ⬜ Not started | 0 / 14 | – | – | |
| M07 | Calls, Follow-ups & Callbacks | ⬜ Not started | 0 / 19 | – | – | Needs Q-07, Q-08 |
| M08 | Site Visits, Revisits, Bookings & Closures | ⬜ Not started | 0 / 15 | – | – | Needs Q-09, Q-10, Q-16 |
| M09 | Billing, Commission & Profit/Loss | ⬜ Not started | 0 / 16 | – | – | Needs Q-11, Q-12, Q-16 |
| M10 | Dashboards, Reports & Analytics | ⬜ Not started | 0 / 20 | – | – | Needs Q-08, Q-10 |
| | **Total** | | **23 / 183** | | | |

**Release milestones**

| Milestone | Modules | Status |
|---|---|---|
| A — Foundation | M01–M02 | 🟨 |
| B — Lead Operations MVP | M03–M05 | ⬜ |
| C — Sales Execution | M06–M08 | ⬜ |
| D — Business Insight (v1.0) | M09–M10 | ⬜ |

---

## 2. Pending — Up Next

1. **M01 delivery** — Playwright E2E suite (M01-25), CI workflow incl. `pnpm audit` (M01-26, completes M01-18), production Dockerfile (M01-27), README/ADRs/backup runbook (M01-28).
2. Then **M02 — Identity, Access Control & Team Structure** (proposed default for Q-04: multi-level reporting hierarchy supported).

---

## 3. Change Log

Newest first. One entry per meaningful change (feature, fix, refactor, decision, docs).

| Date | Module | Task IDs | Change | Commit / PR |
|---|---|---|---|---|
| 2026-09-24 | M01 | M01-14 → M01-17, M01-19 → M01-24 | **Platform services + UI foundation.** S3 storage (presigned PUT/GET, content-type enforcement, CORS) and file service with purposes; SMTP/console/memory e-mail transports + React Email templates + queued delivery; `next-safe-action` pipeline with typed errors; pino logging, request IDs and `/api/health` (DB, storage, worker heartbeat); security headers + nonce-based CSP in `src/proxy.ts`; Dependabot. Tailwind v4 design tokens (light/dark), shadcn-style UI kit, responsive app shell (collapsible sidebar, tablet slide-over), registries (navigation, settings, permissions, extension points), DataTable with URL state (search, sort, paging, filters), DateRangePicker with org-timezone presets, money/date/phone formatters, error/404/403/loading pages. Settings hub, **Organization profile** (company details, logo upload, regional settings, test e-mail) and **System status** (health + domain-event log). **Verified:** 61 unit/integration tests; RustFS + Mailpit integration tests; browser run (Playwright) of save profile → audit + event, logo upload to S3 → sidebar, test e-mail → worker → Mailpit, event-log search/sort/date filter, tablet menu, dark mode, zero console/CSP errors. | `feat(M01): platform services and UI foundation` |
| 2026-09-24 | M01 | M01-01 → M01-13 | **Platform core.** Next.js 16.3 + pnpm + TS strict; ESLint (tenancy/module-boundary import rules), Prettier, Husky, lint-staged, commitlint; `docker-compose.yml` (PostgreSQL 16, RustFS S3 storage, Mailpit); validated env (`src/config/env.ts`, `.env.example`); Prisma 7 multi-file schema + first migration (`organizations`, `organization_settings`, `sequences`, `audit_logs`, `outbox_events`, `file_objects`, `worker_heartbeats`); tenant-scoped Prisma client with guard (T1–T3); per-org sequences; audit log with field diffs; transactional outbox that enqueues handler jobs in the same transaction; pg-boss worker (`pnpm dev:worker`) with cron jobs and heartbeat; storage/e-mail/server-action groundwork; module template; idempotent seed. **Verified:** lint + typecheck clean; 20 integration tests pass (tenant isolation across two orgs, sequence concurrency & rollback, audit diffs & rollback, outbox commit/rollback, worker execution, transactional enqueue, retries). | `feat(M01): platform core` |
| 2026-09-24 | Planning | – | Analysed the PRD (32 sections, 13 pages). Split the web-app scope into 10 modules (M01–M10) with goals, data models, business rules, 183 checklist tasks and acceptance criteria. Defined the architecture (modular monolith on Next.js), multi-tenancy rules T1–T10, access-control model, PRD traceability matrix, future phases (F1 multi-tenant SaaS, F2 mobile, F3 integrations) and risks. Created `BUILD_PLAN.md`, `PROGRESS.md`, `README.md`, `CLAUDE.md`. | initial commit |

---

## 4. Decision Log

| ID | Date | Decision | Reason | Status |
|---|---|---|---|---|
| D-001 | 2026-09-24 | Web app only; the mobile application (PRD §25) is out of scope for now | Requested by product owner | Accepted |
| D-002 | 2026-09-24 | Next.js (App Router) + TypeScript as the application framework | Requested by product owner | Accepted |
| D-003 | 2026-09-24 | Single organization today, multi-tenant-ready data model from day one (shared DB, `organizationId` on every tenant table, rules T1–T10) | Future multi-tenancy requested without data migration | Accepted |
| D-004 | 2026-09-24 | Modular monolith with transport-agnostic services, domain events (outbox) and registries | Progressive, independent module delivery; future mobile API reuse | Accepted |
| D-005 | 2026-09-24 | PostgreSQL + Prisma 7 | Relational integrity, JSONB, `pg_trgm`, RLS path for tenancy | Accepted |
| D-006 | 2026-09-24 | Better Auth for authentication (email + password, DB sessions) | Self-hosted, organization-aware sessions, password reset, rate limiting | Accepted |
| D-007 | 2026-09-24 | pg-boss worker for background jobs (no Redis) | Minimal infrastructure; reminders, digests, imports, exports | Accepted |
| D-008 | 2026-09-24 | Tailwind CSS v4 + shadcn/ui for the UI | Accessible, customizable admin UI components | Accepted |
| D-009 | 2026-09-24 | Build order M01 → M10 (foundation first, features on top) | Each module depends only on earlier ones | Accepted |
| D-010 | 2026-09-24 | Local S3-compatible storage uses **RustFS** instead of MinIO | MinIO community Docker images are no longer published; any S3 API works (AWS S3 / R2 in production) | Accepted |
| D-011 | 2026-09-24 | Event dispatch = outbox row + one pg-boss job per subscribed handler, **enqueued inside the same transaction** (pg-boss `fromPrisma` adapter) instead of a polling relay | Exactly the committed events are dispatched, with per-handler retries and no relay process | Accepted |
| D-012 | 2026-09-24 | Proposed defaults for Q-13 (INR / Asia/Kolkata / en-IN, stored as org settings), Q-14 (Docker + managed Postgres, SMTP) and Q-15 (daily backups + PITR) adopted provisionally so M01 can proceed | Product owner asked to start building; all three are configuration, easy to change | Accepted (provisional) |

---

## 5. Open Questions

Questions for the business. A module should not start until the questions it needs are answered (or a default is accepted).

| ID | Question | Proposed default | Needed by | Status |
|---|---|---|---|---|
| Q-01 | Final lead status names and any restricted transitions? | PRD §6 list (15 statuses), free transitions except terminal → active needs permission | M04 | Open |
| Q-02 | Duplicate policy: block, flag or allow? Duplicate = same mobile, same email, or both? | FLAG on same mobile **or** email | M04 | Open |
| Q-03 | Can executives create leads, and should self-created leads auto-assign to them? | Yes and yes | M04/M05 | Open |
| Q-04 | Reporting hierarchy: single level (Manager → Executives) or multi-level? | Multi-level supported, single level used initially | M02 | Open |
| Q-05 | Lead sources/portals in use today; does any need API intake at launch? | Manual + CSV import + intake API | M04 | Open |
| Q-06 | Is automatic assignment (round-robin/load-based) needed, or manual only? | Manual in v1, auto rules as should-have | M05 | Open |
| Q-07 | Telephony / call-recording provider (if any)? | Manual call logging + recording upload | M07 | Open |
| Q-08 | Thresholds: "unworked" hours, "unresponsive" attempts, missed follow-up grace period | 24 h, 3 attempts, 2 h | M05/M07/M10 | Open |
| Q-09 | Booking stages between Booking and Closed/Won (agreement, registration…)? When is a deal "closed"? | Booked → Agreement → Closed/Won (configurable) | M08 | Open |
| Q-10 | Who gets credit for a booking if the lead was reassigned after a visit? | Executive who created the booking | M08/M10 | Open |
| Q-11 | Revenue model & P&L formula (commission basis, slabs, payouts, incentives, cashback)? | % of agreement value per builder/project rate card | M09 | Open |
| Q-12 | Billing workflow: invoices raised to builders? Tax registration & rates, invoice format? | Builder invoices with configurable tax | M09 | Open |
| Q-13 | Currency, timezone and locale defaults? | INR, Asia/Kolkata, en-IN (org settings) | M01 | Default adopted (provisional, D-012) |
| Q-14 | Hosting preference and email provider? | Docker on a container platform + managed PostgreSQL; SMTP/Resend | M01 | Default adopted (provisional, D-012) |
| Q-15 | Data retention/archival rules and backup RPO/RTO? | Keep all data; daily backups + PITR, RPO 24 h / RTO 4 h | M01 (runbook) | Default adopted (provisional, D-012) |
| Q-16 | Who may see booking values and financial data (managers?) | Admin (+ custom "Accounts" role) only | M08/M09 | Open |

---

## 6. Known Issues & Technical Debt

| ID | Date | Module | Description | Status |
|---|---|---|---|---|
| KI-001 | 2026-09-24 | M01 | The shadcn/ui registry (ui.shadcn.com) is blocked in the build sandbox, so UI primitives are authored by hand following the shadcn source; `components.json` is included so `pnpm dlx shadcn add` works in a normal environment. | Accepted |
| KI-002 | 2026-09-24 | M01 | `@playwright/test` is pinned to 1.56.1 to match the browsers pre-installed in the build sandbox. Upgrade freely where browsers can be downloaded (CI installs its own). | Open |
