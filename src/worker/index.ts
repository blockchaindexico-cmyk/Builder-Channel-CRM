/**
 * Background worker (M01-13): processes pg-boss jobs and domain-event handlers, runs cron schedules and
 * reports liveness to `worker_heartbeats` (shown by /api/health).
 *
 *   pnpm dev:worker   (watch mode)      pnpm worker   (production)
 */
import { hostname } from "node:os";

import { env } from "@/config/env";
import { getServerRegistry } from "@/modules/registry.server";
import { prisma } from "@/platform/db/client";
import { getBoss, stopBoss } from "@/platform/jobs/boss";
import { startJobWorkers } from "@/platform/jobs/runner";
import { logger } from "@/platform/logger";
import { getStorage } from "@/platform/storage";

const HEARTBEAT_INTERVAL_MS = 30_000;
const workerId = `${hostname()}:${process.pid}`;
const startedAt = new Date();

async function heartbeat() {
  const registry = getServerRegistry();
  await prisma.workerHeartbeat.upsert({
    where: { id: workerId },
    create: {
      id: workerId,
      hostname: hostname(),
      pid: process.pid,
      startedAt,
      lastSeenAt: new Date(),
      info: { jobs: registry.jobs.length, eventHandlers: registry.eventHandlers.length },
    },
    update: { lastSeenAt: new Date() },
  });
}

async function main() {
  const registry = getServerRegistry();
  logger.info(
    {
      workerId,
      jobs: registry.jobs.map((j) => j.name),
      handlers: registry.eventHandlers.map((h) => h.name),
    },
    "starting worker",
  );

  if (env.STORAGE_DRIVER === "s3") {
    await getStorage()
      .ensureBucket({ corsOrigins: [env.APP_URL] })
      .catch((error: unknown) => logger.warn({ err: error }, "could not verify storage bucket"));
  }

  const boss = await getBoss("worker");
  await startJobWorkers(boss, registry);
  await heartbeat();
  const timer = setInterval(() => {
    heartbeat().catch((error: unknown) => logger.warn({ err: error }, "heartbeat failed"));
  }, HEARTBEAT_INTERVAL_MS);

  logger.info({ workerId }, "worker ready");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker shutting down");
    clearInterval(timer);
    try {
      await stopBoss({ graceful: true, timeout: 30_000 });
      await prisma.workerHeartbeat.delete({ where: { id: workerId } }).catch(() => undefined);
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, "worker failed to start");
  process.exit(1);
});
