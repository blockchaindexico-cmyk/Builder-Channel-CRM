/**
 * Typed application errors (BUILD_PLAN §2.6). Services throw these; the server-action pipeline and route
 * handlers map them to user-friendly messages and HTTP status codes. Anything else is an unexpected error:
 * it is logged and a generic message is shown.
 */
export type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TENANT_VIOLATION";

const HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  TENANT_VIOLATION: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export class ValidationError extends AppError {
  /** Field-level messages, e.g. `{ email: ["Invalid e-mail"] }`. */
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super("VALIDATION", message, { fieldErrors });
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", `${entity} not found`, id ? { entity, id } : { entity });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.", permission?: string) {
    super("FORBIDDEN", message, permission ? { permission } : undefined);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super("UNAUTHENTICATED", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFLICT", message, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Please try again later.") {
    super("RATE_LIMITED", message);
  }
}

/** Raised when code tries to read or write data outside the current tenant (rule T3). */
export class TenantViolationError extends AppError {
  constructor(message: string) {
    super("TENANT_VIOLATION", message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
