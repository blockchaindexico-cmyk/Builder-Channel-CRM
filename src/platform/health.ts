import { prisma } from "@/platform/db/client";
import { logger } from "@/platform/logger";
import { getStorage } from "@/platform/storage";

export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthCheck {
  status: HealthStatus;
  latencyMs?: number;
  detail?: string;
}

export interface HealthReport {
  status: HealthStatus;
  checks: {
    database: HealthCheck;
    storage: HealthCheck;
    worker: HealthCheck & { lastSeenAt?: string };
  };
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

/** A worker that has not reported for this long is considered down. */
export const WORKER_STALE_AFTER_MS = 90_000;

async function timed(check: () => Promise<void>, timeoutMs = 3_000): Promise<HealthCheck> {
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    logger.warn({ err: error }, "health check failed");
    return { status: "down", latencyMs: Date.now() - startedAt, detail: (error as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks the database, object storage and background worker (M01-17). Used by `/api/health` and the
 * System status settings page. Database down → "down"; storage or worker problems → "degraded".
 */
export async function runHealthChecks(): Promise<HealthReport> {
  const database = await timed(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  const storage = await timed(() => getStorage().ping());

  let worker: HealthReport["checks"]["worker"] = {
    status: "down",
    detail: "No heartbeat received yet",
  };
  if (database.status === "ok") {
    const heartbeat = await prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } });
    if (heartbeat) {
      const age = Date.now() - heartbeat.lastSeenAt.getTime();
      const fresh = age <= WORKER_STALE_AFTER_MS;
      worker = {
        status: fresh ? "ok" : "down",
        lastSeenAt: heartbeat.lastSeenAt.toISOString(),
        detail: fresh ? undefined : "Heartbeat is stale",
      };
    }
  }

  const status: HealthStatus =
    database.status !== "ok"
      ? "down"
      : storage.status === "ok" && worker.status === "ok"
        ? "ok"
        : "degraded";

  return {
    status,
    checks: { database, storage, worker },
    version: process.env.APP_VERSION ?? "dev",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
