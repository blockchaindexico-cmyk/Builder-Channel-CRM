import { randomUUID } from "node:crypto";

import { INTAKE_API_PERMISSIONS, receiveLead } from "@/modules/leads/server/intake";
import {
  abandonIdempotentRequest,
  beginIdempotentRequest,
  completeIdempotentRequest,
  hashRequestBody,
  IDEMPOTENCY_KEY_PATTERN,
} from "@/platform/api/idempotency";
import { authenticateApiKey, createApiKeyContext, readApiKey } from "@/platform/api/keys";
import { consumeRateLimit, rateLimitHeaders } from "@/platform/api/rate-limit";
import { apiError, apiErrorFromException } from "@/platform/api/respond";
import { ConflictError } from "@/platform/errors";
import { PermissionSet } from "@/platform/rbac/permissions";
import { normalizeRequestId } from "@/platform/security/request-id";

/** Requests per minute per API key, and failed authentications per minute per client address. */
const RATE_LIMIT = 60;
const AUTH_FAILURE_LIMIT = 30;
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Lead intake API (M04-20): `POST /api/v1/leads` with `Authorization: Bearer <API key>` and a JSON lead.
 * Optional `Idempotency-Key` header: retries with the same key replay the first response for 24 hours.
 * Documented under Settings → API keys.
 */
export async function POST(request: Request) {
  const requestId = normalizeRequestId(request.headers.get("x-request-id")) ?? randomUUID();
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip");
  const baseHeaders = { "X-Request-Id": requestId };

  const key = readApiKey(request.headers);
  const apiKey = key ? await authenticateApiKey(key) : null;
  if (!apiKey) {
    const failures = await consumeRateLimit(
      `api-auth:${ipAddress ?? "unknown"}`,
      AUTH_FAILURE_LIMIT,
      60,
    );
    if (!failures.allowed) {
      return apiError(
        429,
        "rate_limited",
        "Too many failed attempts. Try again later.",
        {},
        {
          ...baseHeaders,
          ...rateLimitHeaders(failures),
        },
      );
    }
    return apiError(
      401,
      "unauthorized",
      key
        ? "The API key is invalid or has been revoked."
        : "Send your API key in the Authorization header: Bearer <key>.",
      {},
      { ...baseHeaders, "WWW-Authenticate": "Bearer" },
    );
  }

  const limit = await consumeRateLimit(`api:${apiKey.id}`, RATE_LIMIT, 60);
  const headers = { ...baseHeaders, ...rateLimitHeaders(limit) };
  if (!limit.allowed) {
    return apiError(
      429,
      "rate_limited",
      `Rate limit of ${RATE_LIMIT} requests per minute reached. Retry in ${limit.resetInSeconds} seconds.`,
      {},
      headers,
    );
  }

  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    return apiError(
      413,
      "payload_too_large",
      "The request body is larger than 64 KB.",
      {},
      headers,
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_json", "The request body must be a JSON object.", {}, headers);
  }

  let recordId: string | null = null;
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey !== null) {
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return apiError(
        400,
        "idempotency_key_invalid",
        "Idempotency-Key must be 1–255 printable ASCII characters.",
        {},
        headers,
      );
    }
    const started = await beginIdempotentRequest(apiKey, idempotencyKey, hashRequestBody(body));
    if (started.kind === "replay") {
      return Response.json(started.body, {
        status: started.statusCode,
        headers: { ...headers, "Idempotent-Replayed": "true" },
      });
    }
    if (started.kind === "mismatch") {
      return apiError(
        422,
        "idempotency_key_reused",
        "This Idempotency-Key was already used with a different request body.",
        {},
        headers,
      );
    }
    if (started.kind === "in_progress") {
      return apiError(
        409,
        "request_in_progress",
        "A request with this Idempotency-Key is still being processed. Retry shortly.",
        {},
        { ...headers, "Retry-After": "2" },
      );
    }
    recordId = started.recordId;
  }

  const ctx = createApiKeyContext(
    apiKey,
    PermissionSet.fromGrants(
      INTAKE_API_PERMISSIONS.map((permission) => ({ permission, scope: null })),
    ),
    { requestId, ipAddress, userAgent: request.headers.get("user-agent") },
  );
  let status: number;
  let payload: unknown;
  try {
    status = 201;
    payload = { data: await receiveLead(ctx, apiKey, body) };
  } catch (error) {
    const duplicates = error instanceof ConflictError ? error.details?.duplicates : undefined;
    if (Array.isArray(duplicates) && duplicates.length) {
      const [first] = duplicates as { id: string; number: string }[];
      status = 409;
      payload = {
        error: {
          code: "duplicate",
          message: `A lead with this mobile or e-mail already exists (${first!.number}).`,
          duplicateOf: { id: first!.id, number: first!.number },
        },
      };
    } else {
      const mapped = apiErrorFromException(error, { requestId });
      status = mapped.status;
      payload = mapped.body;
    }
  }

  if (recordId) {
    if (status >= 500) await abandonIdempotentRequest(recordId);
    else await completeIdempotentRequest(recordId, status, payload);
  }
  return Response.json(payload, { status, headers });
}
