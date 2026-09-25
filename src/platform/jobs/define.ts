import type { QueueOptions, QueuePolicy } from "pg-boss";
import type { z } from "zod";

import type { Logger } from "@/platform/logger";

export interface JobRunContext {
  jobId: string;
  queue: string;
  logger: Logger;
}

/**
 * A background job type processed by the worker (`src/worker`). The name is the pg-boss queue name.
 * Handlers must be idempotent: a job can be retried after a crash or a failed attempt.
 */
export interface JobDefinition<TData = unknown> {
  name: string;
  description?: string;
  /** Validates the payload before the handler runs (and when enqueuing). */
  schema?: z.ZodType<TData>;
  handler: (data: TData, job: JobRunContext) => Promise<void>;
  /** Retry/expiry/retention defaults for the queue, and its policy (e.g. `short`: one queued job per singleton key). */
  queue?: QueueOptions & { policy?: QueuePolicy };
  /** Recurring schedule (cron, evaluated in `tz`, default UTC). */
  cron?: { expression: string; tz?: string; data?: TData };
  /** Parallel jobs processed per worker process. Default 1. */
  concurrency?: number;
}

export function defineJob<TData>(definition: JobDefinition<TData>): JobDefinition<TData> {
  return definition;
}

/** Default queue options: 3 retries with exponential backoff, 15 min expiry, keep completed jobs 7 days. */
export const DEFAULT_QUEUE_OPTIONS: QueueOptions = {
  retryLimit: 3,
  retryDelay: 10,
  retryBackoff: true,
  retryDelayMax: 600,
  expireInSeconds: 900,
  deleteAfterSeconds: 7 * 24 * 3600,
};
