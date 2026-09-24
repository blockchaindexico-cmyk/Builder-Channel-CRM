import { createAuthClient } from "better-auth/react";

/** Browser client for the Better Auth endpoints under /api/auth (same origin). */
export const authClient = createAuthClient();

/** Maps Better Auth error codes to messages shown in the UI. */
export function authErrorMessage(
  error: { code?: string; message?: string; status?: number } | null | undefined,
) {
  if (!error) return null;
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "The e-mail or password is incorrect.";
    case "ACCOUNT_INACTIVE":
    case "ACCOUNT_LOCKED":
    case "WEAK_PASSWORD":
      return error.message ?? "Request failed.";
    case "INVALID_TOKEN":
      return "This link is invalid or has expired. Request a new one.";
    case "INVALID_PASSWORD":
      return "The current password is incorrect.";
    default:
      if (error.status === 429)
        return error.message || "Too many attempts. Please wait a minute and try again.";
      return error.message || "Something went wrong. Please try again.";
  }
}
