import "server-only";

import { forbidden, notFound } from "next/navigation";
import { z } from "zod";

import { isAppError } from "@/platform/errors";

/**
 * Loads a page's main record and maps service errors to the framework pages: NOT_FOUND → 404 page,
 * FORBIDDEN → 403 page. Anything else propagates to the error boundary.
 */
export async function loadOrNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") forbidden();
    throw error;
  }
}

const idSchema = z.uuid();

/** Validates a dynamic `[id]` route segment; malformed ids render the 404 page instead of a database error. */
export function routeId(value: string): string {
  const result = idSchema.safeParse(value);
  if (!result.success) notFound();
  return result.data;
}
