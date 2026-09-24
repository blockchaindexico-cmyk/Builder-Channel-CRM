/**
 * Password policy (M02-04): at least 10 characters with letters and numbers, not a trivially repeated
 * character. Returns a user-facing problem description, or null when the password is acceptable.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_HINT = "At least 10 characters, including letters and numbers.";

export function assertPasswordPolicy(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 128) return "Use at most 128 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  if (/^(.)\1+$/.test(password)) return "Avoid repeating a single character.";
  return null;
}
