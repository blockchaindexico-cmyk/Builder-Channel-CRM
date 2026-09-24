import { randomBytes } from "node:crypto";

import { auth } from "./auth";

/** Invitation links stay valid for 72 hours (password resets: 1 hour). */
export const INVITATION_VALID_HOURS = 72;

/**
 * Creates a one-time password-setup token in Better Auth's verification store. The token is consumed by the
 * standard `/reset-password` endpoint, which also creates the user's credential account on first use.
 */
export async function createPasswordSetupToken(
  userId: string,
  validHours = INVITATION_VALID_HOURS,
): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const context = await auth.$context;
  await context.internalAdapter.createVerificationValue({
    identifier: `reset-password:${token}`,
    value: userId,
    expiresAt: new Date(Date.now() + validHours * 3600 * 1000),
  });
  return token;
}
