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
- `LOG_LEVEL=info`, `JOBS_SCHEMA=pgboss`, `WORKER_CONCURRENCY`.

## Release procedure

1. Build the images from the same commit: `docker build --target web …`, `--target worker …`, `--target migrate …`.
2. Run migrations with the new migrate image: `docker run --rm --env-file prod.env crm-migrate`.
   Migrations must be backward compatible with the previous web version (expand → migrate → contract).
3. Roll out the worker, then the web instances (rolling update).
4. Verify `GET /api/health` returns `"status":"ok"` (database, storage and worker heartbeat).
5. Watch logs for `level >= 50` (error) for 15 minutes.

## Rollback

Redeploy the previous images. Only roll back migrations with a prepared down-migration; prefer forward fixes.

## Operational checks

- `/api/health` → 503 when the database is unreachable; `degraded` when storage or the worker is down.
- Settings → System status shows the same checks plus the domain-event log per organization.
- pg-boss tables live in the `pgboss` schema; failed jobs can be inspected with SQL
  (`SELECT name, state, output FROM pgboss.job WHERE state = 'failed'`).
