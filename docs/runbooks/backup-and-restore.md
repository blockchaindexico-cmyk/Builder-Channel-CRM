# Runbook — Backup & restore (PRD §27)

Targets (provisional, open question Q-15): **RPO 24 h** (daily backups + point-in-time recovery for minutes-level
loss) and **RTO 4 h**. All data is retained until retention rules are agreed.

## What must be backed up

| Data | Where | How |
|---|---|---|
| Business data, jobs, events | PostgreSQL | Managed automated backups + PITR (7–35 days), plus a nightly logical dump |
| Files (logos, documents, recordings, invoices) | Object storage bucket | Bucket versioning + lifecycle rules; cross-region replication for production |
| Configuration | Environment / secret manager | Kept in the deployment platform's secret store |

## Nightly logical dump (in addition to managed backups)

```bash
pg_dump --format=custom --no-owner --dbname "$DATABASE_URL" --file "crm-$(date +%F).dump"
# upload to a separate, access-restricted bucket with 30-day retention
```

## Restore — full database

1. Put the app in maintenance (scale web and worker to 0).
2. Restore the managed backup / PITR to a **new** database instance (never over the live one).
3. Or from a dump: `pg_restore --clean --if-exists --no-owner --dbname "$NEW_DATABASE_URL" crm-YYYY-MM-DD.dump`.
4. Run `pnpm db:deploy` against the restored database to confirm it is at the expected migration.
5. Point `DATABASE_URL` to the restored database, scale the worker, then the web instances back up.
6. Verify `/api/health`, sign in, open a few records, and check Settings → System status.

## Restore — files

- Restore previous object versions from bucket versioning, or copy from the replica bucket.
- `file_objects.key` identifies each object; `status = DELETED` rows are soft-deleted and can be undeleted by
  restoring the object and setting `status = 'READY'`.

## Restore drill

Run a restore drill **quarterly** into a staging environment and record the achieved RPO/RTO in PROGRESS.md.
