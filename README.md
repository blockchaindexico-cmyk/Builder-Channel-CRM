# Builder Channel CRM

A CRM for a real-estate channel partner, built with Next.js. It manages builders, projects, leads, executives, managers,
calls, follow-ups, callbacks, site visits, bookings, closures, billing and profit & loss on one platform.

- **Scope:** web application (responsive for desktop, laptop and tablet). The mobile app is out of scope for now.
- **Tenancy:** runs for a single organization today. The data model is multi-tenant ready (see
  [`docs/adr/0002-multi-tenancy.md`](./docs/adr/0002-multi-tenancy.md)).

## Project documents

| File | Purpose |
|---|---|
| [`BUILD_PLAN.md`](./BUILD_PLAN.md) | PRD analysis, architecture, the 10 build modules with checklists and acceptance criteria |
| [`PROGRESS.md`](./PROGRESS.md) | Module status board, change log, decision log, open questions |
| [`CLAUDE.md`](./CLAUDE.md) | Working conventions for AI-assisted development sessions |
| [`docs/adr/`](./docs/adr) | Architecture decision records |
| [`docs/runbooks/`](./docs/runbooks) | Deployment, backup & restore |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · PostgreSQL 16 · Prisma 7 · pg-boss (background jobs) ·
Tailwind CSS v4 + shadcn-style components (Radix UI) · Zod · next-safe-action · TanStack Table · nuqs ·
React Email · S3-compatible storage · Vitest · Playwright.

## Getting started

### Prerequisites

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable`)
- Docker (for PostgreSQL, S3-compatible storage and the e-mail catcher)

### First run

```bash
cp .env.example .env          # local defaults work with docker-compose
pnpm install
pnpm services:up              # PostgreSQL :5432, RustFS (S3) :9000/:9001, Mailpit :1025/:8025
pnpm db:generate              # generate the Prisma client
pnpm db:deploy                # apply migrations
pnpm db:seed                  # organization, system roles, first admin (+ demo users), storage bucket
pnpm dev                      # web (http://localhost:3000) + background worker
```

Useful local URLs:

| URL | What |
|---|---|
| http://localhost:3000 | The CRM |
| http://localhost:3000/api/health | Health check (database, storage, worker) |
| http://localhost:8025 | Mailpit — every e-mail the app sends locally |
| http://localhost:9001 | RustFS console (object storage), login `crm-access-key` / `crm-secret-key` |

### Signing in

The seed creates the first administrator from `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and, when
`SEED_DEMO_USERS=true` (never in production), a demo team that shares the admin's password:

| E-mail | Role | Reports to |
|---|---|---|
| `admin@demo-realty.test` | Admin | — |
| `manager@demo-realty.test` | Manager | Admin |
| `esha@demo-realty.test`, `rahul@demo-realty.test` | Executive | Manager |

With the local `.env` the password is `ChangeMe123!`. There is no public sign-up: administrators invite people from
**Settings → Users**, and invitations and password resets arrive by e-mail (Mailpit locally).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Web app + background worker in watch mode |
| `pnpm dev:web` / `pnpm dev:worker` | Run one of them |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm worker` | Background worker (production) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (includes tenancy and module-boundary rules) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm typecheck` | Route type generation + TypeScript |
| `pnpm test` | Unit + integration tests (Vitest; integration tests use `TEST_DATABASE_URL`) |
| `pnpm test:e2e` | End-to-end tests (Playwright; starts `pnpm dev` unless a server is running) |
| `pnpm db:migrate` | Create/apply a migration in development |
| `pnpm db:deploy` | Apply migrations (CI/production) |
| `pnpm db:seed` | Idempotent seed |
| `pnpm db:studio` | Prisma Studio |
| `pnpm services:up` / `pnpm services:down` | Start/stop docker-compose services |

## Project structure

```
prisma/schema/          one .prisma file per module (platform, identity, catalog, leads, …)
src/app/                routes: (app) = authenticated shell, api/ = route handlers
src/modules/<module>/   business modules: manifest, permissions, schemas, actions, components, server/
src/modules/registry.ts         composition root for module manifests (navigation, settings, permissions)
src/modules/registry.server.ts  composition root for jobs, event handlers and file purposes
src/platform/           cross-cutting core: db (tenant scope), audit, events, jobs, storage, email, rbac, …
src/components/ui/      UI primitives;  src/components/shared/  app shell, DataTable, PageHeader, …
src/worker/             background worker entrypoint
tests/integration/      integration tests (real PostgreSQL, S3 and SMTP)
tests/e2e/              Playwright end-to-end tests
```

See [`src/modules/_template/README.md`](./src/modules/_template/README.md) for how to add a module, and
`BUILD_PLAN.md` §2 for the architecture and the non-negotiable multi-tenancy rules (T1–T10).

## Testing

- **Unit tests** live next to the code (`src/**/*.test.ts`).
- **Integration tests** (`tests/integration`) run against the `crm_test` database created by
  `docker/postgres/init.sql`; the global setup migrates and truncates it. Storage/e-mail tests talk to RustFS and
  Mailpit and are skipped automatically when those services are not running.
- **End-to-end tests** (`tests/e2e`) run against a seeded local database (with demo users) in desktop and tablet
  viewports. A setup project signs in as admin, manager and executive once and stores the sessions in
  `tests/e2e/.auth/` (git-ignored); tests run as the admin unless they pick another persona.

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, dependency audit, all Vitest tests, a production
build and the Playwright suite against real PostgreSQL, RustFS and Mailpit services.

## Docker images

```bash
docker build --target web -t crm-web .          # Next.js standalone server on :3000 (~340 MB)
docker build --target worker -t crm-worker .    # background worker: one self-contained bundle (~250 MB)
docker build --target migrate -t crm-migrate .  # release tasks: migrations (default) and seed
docker run --rm --env-file prod.env crm-migrate                 # pnpm db:deploy
docker run --rm --env-file prod.env crm-migrate pnpm db:seed
```

See [`docs/runbooks/deployment.md`](./docs/runbooks/deployment.md) for environment variables, rollout order and
scaling notes.

## Build modules

| # | Module | Status |
|---|---|---|
| M01 | Project Foundation & Platform Core | Done |
| M02 | Identity, Access Control & Team Structure | Done |
| M03 | Builder & Project Management | Planned |
| M04 | Lead Management Core | Planned |
| M05 | Lead Assignment, Reassignment & Team Workload | Planned |
| M06 | Notifications & Reminders Engine | Planned |
| M07 | Calls, Follow-ups & Callbacks | Planned |
| M08 | Site Visits, Revisits, Bookings & Closures | Planned |
| M09 | Billing, Commission & Profit/Loss | Planned |
| M10 | Dashboards, Reports & Analytics | Planned |

Live status: [`PROGRESS.md`](./PROGRESS.md).
