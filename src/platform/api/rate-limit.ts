import { prisma } from "@/platform/db/client";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window ends. */
  resetInSeconds: number;
}

/**
 * Fixed-window rate limiting in PostgreSQL (no Redis, D-007): one row per key and window, updated atomically, so it
 * holds across web instances. Used by the public API (per API key, and per IP for failed authentication).
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const [row] = await prisma.$queryRaw<{ count: number; reset_in: number }[]>`
    INSERT INTO "rate_limit_windows" ("key", "window_start", "count")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "rate_limit_windows"."window_start" <= now() - (${windowSeconds}::int * interval '1 second') THEN 1
        ELSE "rate_limit_windows"."count" + 1
      END,
      "window_start" = CASE
        WHEN "rate_limit_windows"."window_start" <= now() - (${windowSeconds}::int * interval '1 second') THEN now()
        ELSE "rate_limit_windows"."window_start"
      END
    RETURNING "count",
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("window_start" + (${windowSeconds}::int * interval '1 second') - now()))))::int AS reset_in`;
  const count = Number(row?.count ?? 1);
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetInSeconds: Number(row?.reset_in ?? windowSeconds),
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetInSeconds),
    ...(result.allowed ? {} : { "Retry-After": String(Math.max(1, result.resetInSeconds)) }),
  };
}
