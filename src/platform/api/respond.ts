import { isAppError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logger";

/**
 * JSON responses of the public API (`/api/v1`). Errors share one shape:
 * `{ "error": { "code": "validation_failed", "message": "…", "fields": { "mobile": ["…"] } } }`.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_json"
  | "payload_too_large"
  | "validation_failed"
  | "duplicate"
  | "conflict"
  | "idempotency_key_invalid"
  | "idempotency_key_reused"
  | "request_in_progress"
  | "rate_limited"
  | "internal_error";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return Response.json({ error: { code, message, ...extra } }, { status, headers });
}

/** Maps a thrown error to the API error shape; unexpected errors are logged and reported as 500. */
export function apiErrorFromException(
  error: unknown,
  context: { requestId?: string } = {},
): { status: number; body: { error: Record<string, unknown> } } {
  if (error instanceof ValidationError) {
    return {
      status: 422,
      body: {
        error: { code: "validation_failed", message: error.message, fields: error.fieldErrors },
      },
    };
  }
  if (isAppError(error)) {
    const code: ApiErrorCode =
      error.code === "NOT_FOUND"
        ? "not_found"
        : error.code === "CONFLICT"
          ? "conflict"
          : error.code === "RATE_LIMITED"
            ? "rate_limited"
            : error.code === "UNAUTHENTICATED"
              ? "unauthorized"
              : "forbidden";
    return { status: error.httpStatus, body: { error: { code, message: error.message } } };
  }
  logger.error({ err: error, requestId: context.requestId }, "public API request failed");
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Something went wrong on our side. Please retry later.",
        requestId: context.requestId,
      },
    },
  };
}
