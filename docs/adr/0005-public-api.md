# ADR 0005 — Public API with API keys, idempotency and rate limits

- **Status:** Accepted (2026-09-25)
- **Related:** BUILD_PLAN M04-20, PRD §5 (lead capture from websites and portals), decisions D-026 → D-028

## Context

Websites, landing pages and property portals must be able to create leads without a user session. Their calls come
over unreliable networks (retries), from code we do not control (bursts, bad input) and must never reach another
organization's data. The mobile app (future phase F2) will need an API as well, so the mechanism belongs to the
platform rather than to the leads module.

## Decision

- Everything under `/api/v1` is public to the session proxy and authenticates with an **API key** per organization
  (`Authorization: Bearer <key>` or `X-API-Key`). Keys look like `crm_<8 hex>_<32 base64url>`; only a SHA-256 hash and
  the `crm_<8 hex>` prefix are stored, the full key is shown once. Keys are never edited, only revoked (audited).
- A request made with a key gets a normal `ServiceContext` (`src/platform/api/keys.ts`): the organization comes from
  the key, the actor is the key (`API_KEY`, recorded in audit and timelines) and the permissions are fixed by the
  endpoint (lead intake: `leads.create` + `projects.view`). The same services as the web app run — the API is a thin
  transport (`src/app/api/v1/…`).
- **Idempotency:** an optional `Idempotency-Key` header reserves the key (per API key) before the work starts; retries
  with the same body replay the stored status and body for 24 hours, a different body is rejected (422), a retry while
  the first request runs gets 409. Unexpected failures release the key so the client can retry.
- **Rate limits:** fixed one-minute windows in PostgreSQL (`rate_limit_windows`, atomic upsert) — 60 requests per key,
  30 failed authentications per client address. No Redis (D-007). Hourly cleanup job for both tables.
- Errors share one JSON shape `{ error: { code, message, fields? } }`; validation errors list problems per field.

## Consequences

- Idempotency and rate-limit bookkeeping cost two small queries per request — fine for lead intake volumes; a cache
  in front can come later if the API grows.
- The auth-failure limit trusts `X-Forwarded-For` like the rest of the app (deployment runbook, KI-004).
- New endpoints (mobile app, integrations) reuse the key, context, idempotency and error helpers and declare their own
  permission set.
