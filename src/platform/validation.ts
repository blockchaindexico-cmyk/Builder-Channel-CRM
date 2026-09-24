import type { z } from "zod";

import { ValidationError } from "@/platform/errors";

/**
 * Validates service input with a zod schema and converts failures into a `ValidationError` carrying
 * field-level messages (services are transport-agnostic, so they re-validate everything they receive).
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join(".");
    if (!path) {
      formErrors.push(issue.message);
      continue;
    }
    (fieldErrors[path] ??= []).push(issue.message);
  }
  const message = formErrors[0] ?? "Some fields are invalid. Please check the highlighted values.";
  throw new ValidationError(message, fieldErrors);
}
