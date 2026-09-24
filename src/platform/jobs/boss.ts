import { PgBoss } from "pg-boss";

import { env } from "@/config/env";
import { getServerRegistry } from "@/modules/registry.server";
import { eventHandlerQueueName } from "@/platform/events/define";
import { logger } from "@/platform/logger";

import { DEFAULT_QUEUE_OPTIONS } from "./define";

/**
 * pg-boss lifecycle (M01-13).
 *
 * - `web` role: send-only instance used by the Next.js server to enqueue jobs (no supervision/cron).
 * - `worker` role: the background worker (`src/worker`), which also supervises queues and runs cron schedules.
 *
 * Both roles create the queues of every registered job and event handler (idempotent).
 */
export type BossRole = "web" | "worker";

const globalForBoss = globalThis as unknown as { __crmBoss?: Promise<PgBoss> };

async function startBoss(role: BossRole): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.JOBS_SCHEMA,
    application_name: `crm-${role}`,
    max: role === "worker" ? 10 : 3,
    supervise: role === "worker",
    schedule: role === "worker",
    migrate: true,
  });
  boss.on("error", (error) => logger.error({ err: error, role }, "pg-boss error"));
  await boss.start();
  await ensureQueues(boss);
  return boss;
}

/** Returns the process-wide pg-boss instance, starting it on first use. */
export function getBoss(role: BossRole = "web"): Promise<PgBoss> {
  if (!globalForBoss.__crmBoss) {
    globalForBoss.__crmBoss = startBoss(role).catch((error: unknown) => {
      globalForBoss.__crmBoss = undefined;
      throw error;
    });
  }
  return globalForBoss.__crmBoss;
}

/** Creates the queue for every registered job and event handler (no-op for existing queues). */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  const registry = getServerRegistry();
  for (const job of registry.jobs) {
    await boss.createQueue(job.name, { ...DEFAULT_QUEUE_OPTIONS, ...job.queue });
  }
  for (const handler of registry.eventHandlers) {
    await boss.createQueue(eventHandlerQueueName(handler.name), {
      ...DEFAULT_QUEUE_OPTIONS,
      ...handler.queue,
    });
  }
}

/** Stops pg-boss gracefully, waiting for active jobs (used on worker shutdown and in tests). */
export async function stopBoss(
  options: { graceful?: boolean; timeout?: number } = {},
): Promise<void> {
  const pending = globalForBoss.__crmBoss;
  globalForBoss.__crmBoss = undefined;
  if (!pending) return;
  const boss = await pending.catch(() => null);
  await boss?.stop({
    graceful: options.graceful ?? true,
    timeout: options.timeout ?? 30_000,
    close: true,
  });
}
