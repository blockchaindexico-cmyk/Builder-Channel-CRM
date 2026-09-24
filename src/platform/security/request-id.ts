/** Accepts an upstream request id (from a trusted proxy/load balancer) only if it looks sane. */
export function normalizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9._:-]{8,64}$/.test(value) ? value : null;
}
