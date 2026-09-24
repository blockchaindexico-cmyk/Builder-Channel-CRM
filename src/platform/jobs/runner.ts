import type { PgBoss } from "pg-boss";

import { eventHandlerQueueName } from "@/platform/events/define";
import type { EventJobData } from "@/platform/events/publish";
import { logger } from "@/platform/logger";
import type { ServerRegistry } from "@/platform/registry/server";
import { createSystemContext } from "@/platform/tenant/context";

/**
 * Registers pg-boss workers for every job and event handler and installs cron schedules (worker process only).
 * Each handler failure is thrown back to pg-boss so the job is retried with backoff.
 */
export async function startJobWorkers(boss: PgBoss, registry: ServerRegistry): Promise<void> {
  for (const job of registry.jobs) {
    await boss.work<unknown>(
      job.name,
      { batchSize: 1, localConcurrency: job.concurrency ?? 1, pollingIntervalSeconds: 1 },
      async ([record]) => {
        if (!record) return;
        const jobLogger = logger.child({ job: job.name, jobId: record.id });
        const data = job.schema ? job.schema.parse(record.data) : record.data;
        const startedAt = Date.now();
        try {
          await job.handler(data, { jobId: record.id, queue: job.name, logger: jobLogger });
          jobLogger.debug({ ms: Date.now() - startedAt }, "job completed");
        } catch (error) {
          jobLogger.error({ err: error }, "job failed");
          throw error;
        }
      },
    );

    if (job.cron) {
      await boss.schedule(job.name, job.cron.expression, (job.cron.data ?? {}) as object, {
        tz: job.cron.tz ?? "UTC",
      });
    }
  }

  for (const handler of registry.eventHandlers) {
    const queue = eventHandlerQueueName(handler.name);
    await boss.work<EventJobData>(
      queue,
      { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 1 },
      async ([record]) => {
        if (!record) return;
        const { event } = record.data;
        const handlerLogger = logger.child({
          handler: handler.name,
          eventId: event.id,
          eventType: event.type,
          organizationId: event.organizationId,
        });
        const ctx = createSystemContext(event.organizationId, {
          name: `event:${handler.name}`,
          requestId: event.requestId ?? undefined,
        });
        try {
          await handler.handle(event, ctx);
          handlerLogger.debug("event handled");
        } catch (error) {
          handlerLogger.error({ err: error }, "event handler failed");
          throw error;
        }
      },
    );
  }
}
