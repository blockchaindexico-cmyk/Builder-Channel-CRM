# Runbook — Deployment

## Components

| Component | Image target | Command | Scale |
|---|---|---|---|
| Web (Next.js standalone) | `web` | `node server.js` (port 3000) | Horizontal; stateless |
| Worker (jobs, events, cron) | `worker` | `node dist/worker/index.mjs` (self-contained bundle) | 1+ instances (pg-boss coordinates) |
| Migrations / seed | `migrate` | `pnpm db:deploy` (default), `pnpm db:seed` | One-off per release |
| PostgreSQL 16+ | managed service | — | Automated backups + PITR |
| Object storage | S3 / R2 | — | Versioning recommended |
| SMTP / Resend | provider | — | — |

## Required environment variables

See `.env.example` for the full, documented list. Production essentials:

- `DATABASE_URL` — PostgreSQL connection string (use SSL).
- `APP_URL` — public HTTPS URL (enables HSTS and `upgrade-insecure-requests`).
- `STORAGE_DRIVER=s3`, `S3_ENDPOINT` (omit for AWS), `S3_PUBLIC_ENDPOINT` (if different), `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (`false` for AWS).
- `EMAIL_TRANSPORT=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` — the same value on every web instance (`openssl rand -base64 32`), otherwise
  Server Action references break across instances and deploys.
- `BETTER_AUTH_SECRET` — at least 32 random characters (`openssl rand -base64 32`); signs session cookies and tokens.
  Rotating it signs everyone out.
- `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — the first administrator, created by the first
  `pnpm db:seed` (later runs never change an existing user). Leave `SEED_DEMO_USERS` unset in production.
- `AUTH_RATE_LIMIT_ENABLED=true` (default) — per-IP limits on sign-in and password endpoints.
- `LOG_LEVEL=info`, `JOBS_SCHEMA=pgboss`, `WORKER_CONCURRENCY`.

## Reverse proxy

Run the web instances behind a reverse proxy or load balancer that terminates TLS and **overwrites** the
`X-Forwarded-For` header with the real client address (for example nginx
`proxy_set_header X-Forwarded-For $remote_addr;`, or the platform's managed load balancer). The authentication rate
limiter and the audit log read the client IP from that header; if clients can set it themselves they can spread
sign-in attempts over fake addresses (per-account lockout after 5 failures still applies). Do not expose the web
containers directly to the internet.

## Release procedure

1. Build the images from the same commit: `docker build --target web …`, `--target worker …`, `--target migrate …`.
2. Run migrations with the new migrate image: `docker run --rm --env-file prod.env crm-migrate`.
   Migrations must be backward compatible with the previous web version (expand → migrate → contract).
3. Roll out the worker, then the web instances (rolling update).
4. Verify `GET /api/health` returns `"status":"ok"` (database, storage and worker heartbeat).
   On the very first release, run the seed once (`crm-migrate pnpm db:seed`) to create the organization, the system
   roles and the first administrator; re-running it after later releases grants new modules' default permissions to
   the system roles (existing admin edits are kept).
5. Watch logs for `level >= 50` (error) for 15 minutes.

## Rollback

Redeploy the previous images. Only roll back migrations with a prepared down-migration; prefer forward fixes.

## Operational checks

- `/api/health` → 503 when the database is unreachable; `degraded` when storage or the worker is down.
- Settings → System status shows the same checks plus the domain-event log per organization.
- pg-boss tables live in the `pgboss` schema; failed jobs can be inspected with SQL
  (`SELECT name, state, output FROM pgboss.job WHERE state = 'failed'`).
