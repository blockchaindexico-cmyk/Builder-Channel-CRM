# ADR 0004 — File storage via presigned S3 URLs

- **Status:** Accepted (2026-09-24)
- **Related:** BUILD_PLAN M01-14, PRD §27, decision D-010

## Context

The CRM stores logos, project brochures, lead attachments, call recordings and generated invoices. Files must be
tenant-isolated, access-controlled and must not stream through the web server.

## Decision

- An S3-compatible provider (`src/platform/storage`) — AWS S3 or Cloudflare R2 in production, **RustFS** locally
  (MinIO community images are no longer published). An in-memory provider is used by tests.
- Browser uploads use a three-step flow: `requestUpload` validates the purpose (allowed types, size limit, permission)
  and records a `PENDING` `file_objects` row → the browser `PUT`s directly to storage with a short-lived presigned URL
  that pins the content type → `completeUpload` verifies the stored object (exists, size within the limit) and marks it
  `READY`, deleting oversized uploads.
- Downloads use short-lived presigned `GET` URLs issued only after the purpose's read rule passes.
- Object keys are `orgs/{organizationId}/{purpose}/{yyyy}/{mm}/{uuid}/{safe-name}` (rule T8).
- File purposes are registered by modules in their server manifest.
- Files are soft-deleted; physical purge follows the retention policy (open question Q-15). Abandoned `PENDING`
  uploads are cleaned up hourly by the worker.

## Consequences

- The bucket needs CORS for the app origin (applied by `ensureBucket`, run by the seed and the worker).
- The storage origin is added to the Content-Security-Policy (`img-src`, `media-src`, `connect-src`).
