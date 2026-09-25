import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/** Shape of `result.serverError` produced by the action client (see platform/actions/client.ts). */
export interface ClientActionError {
  message: string;
  code: string;
  fieldErrors?: Record<string, string[]>;
}

interface ActionResultLike {
  serverError?: ClientActionError | unknown;
  validationErrors?:
    { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } | unknown;
}

function isClientActionError(value: unknown): value is ClientActionError {
  return typeof value === "object" && value !== null && "message" in value;
}

/**
 * Copies server-side validation/field errors onto a react-hook-form instance and returns a message suitable
 * for a toast (or null when the action succeeded).
 */
export function applyActionErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, "setError">,
  result: ActionResultLike | undefined,
): string | null {
  if (!result) return "No response from the server. Please try again.";

  const validation = result.validationErrors as
    { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } | undefined;
  if (validation) {
    for (const [field, messages] of Object.entries(validation.fieldErrors ?? {})) {
      if (messages?.[0]) form.setError(field as Path<T>, { type: "server", message: messages[0] });
    }
    return validation.formErrors?.[0] ?? "Please correct the highlighted fields.";
  }

  if (result.serverError) {
    if (isClientActionError(result.serverError)) {
      for (const [field, messages] of Object.entries(result.serverError.fieldErrors ?? {})) {
        if (messages[0]) form.setError(field as Path<T>, { type: "server", message: messages[0] });
      }
      return result.serverError.message;
    }
    return "Something went wrong. Please try again.";
  }
  return null;
}

/** Error message from an action result that is not tied to a form. */
export function actionErrorMessage(result: ActionResultLike | undefined): string | null {
  if (!result) return "No response from the server. Please try again.";
  if (result.validationErrors) return "The request was not valid.";
  if (result.serverError) {
    return isClientActionError(result.serverError)
      ? result.serverError.message
      : "Something went wrong.";
  }
  return null;
}
