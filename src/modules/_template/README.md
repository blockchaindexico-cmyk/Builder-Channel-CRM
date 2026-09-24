# Module template

Copy this layout when starting a new module (M02 `identity`, M03 `catalog`, M04 `leads`, …).
The `organization` module is a small, complete reference implementation.

```
src/modules/<name>/
├── index.ts            # PUBLIC API — the only file other modules may import (ESLint-enforced)
├── manifest.ts         # client-safe: nav items, settings sections, permissions, contributions
├── permissions.ts      # permission key constants
├── schemas.ts          # zod schemas shared by forms (client) and services (server)
├── actions.ts          # "use server" — thin: tenantAction + metadata → service call → revalidate
├── components/         # module UI (server + client components)
└── server/
    ├── index.ts        # ServerModule: jobs, event handlers, file purposes
    ├── events.ts       # `declare module "@/platform/events/types"` — the module's domain events
    └── service.ts      # business logic: (ctx: ServiceContext, input) → result
```

## Checklist for a new module

1. Add Prisma models in `prisma/schema/<name>.prisma` following the tenancy rules T1–T10
   (`organizationId` on every tenant table, per-tenant uniques, composite FKs to tenant parents).
2. Register the manifest in `src/modules/registry.ts` and the server module in `src/modules/registry.server.ts`.
3. Services: assert permissions, apply data scope, use `ctx.db` (never the raw client), and write audit
   entries (+ lead timeline entries) and domain events in the same transaction as the change.
4. Tests: integration tests with two organizations for anything tenant-owned; permission/scope tests per role.
5. Update `BUILD_PLAN.md` checkboxes and `PROGRESS.md`.
