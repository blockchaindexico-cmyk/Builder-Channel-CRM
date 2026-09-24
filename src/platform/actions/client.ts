import "server-only";

import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";

import { isAppError, ValidationError } from "@/platform/errors";
import { logger } from "@/platform/logger";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Error shape returned to the client in `result.serverError`. */
export interface ActionServerError {
  message: string;
  code: string;
  fieldErrors?: Record<string, string[]>;
}

const GENERIC_ERROR: ActionServerError = {
  code: "INTERNAL",
  message: "Something went wrong. Please try again.",
};

/**
 * Base server-action client (M01-16). Every action declares metadata `{ name, permission? }`.
 * Expected errors (`AppError`) are returned to the client; unexpected ones are logged and replaced with a
 * generic message so internals never leak.
 */
export const actionClient = createSafeActionClient({
  defineMetadataSchema: () =>
    z.object({
      name: z.string().min(1),
      permission: z.string().optional(),
    }),
  defaultValidationErrorsShape: "flattened",
  handleServerError(error, utils): ActionServerError {
    if (isAppError(error)) {
      return {
        code: error.code,
        message: error.message,
        fieldErrors: error instanceof ValidationError ? error.fieldErrors : undefined,
      };
    }
    logger.error({ err: error, action: utils.metadata?.name }, "server action failed");
    return GENERIC_ERROR;
  },
});

/**
 * Action client for tenant-scoped operations: resolves the request's service context (tenant + actor), checks
 * the declared permission, and exposes the context to the action as `ctx.service`.
 * Services still enforce permissions and data scope themselves (UI and action checks are not the boundary).
 */
export const tenantAction = actionClient.use(async ({ next, metadata }) => {
  const service = await getRequestContext();
  if (metadata.permission) service.permissions.assert(metadata.permission);
  const startedAt = Date.now();
  const result = await next({ ctx: { service } });
  logger.debug(
    { action: metadata.name, requestId: service.requestId, ms: Date.now() - startedAt },
    "server action executed",
  );
  return result;
});
