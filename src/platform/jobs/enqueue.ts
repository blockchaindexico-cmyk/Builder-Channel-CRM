import { fromPrisma, type PrismaTransactionLike, type SendOptions } from "pg-boss";

import { getServerRegistry } from "@/modules/registry.server";

import { getBoss } from "./boss";

export interface EnqueueOptions {
  /**
   * Transaction to enqueue in. When given, the job is inserted by that transaction and only becomes
   * visible if it commits — use it whenever the job depends on data written in the same transaction.
   */
  tx?: PrismaTransactionLike;
  /** Run no earlier than this time (Date) or this many seconds from now (number). */
  startAfter?: Date | number;
  /** Prevents duplicates of the same logical job while one is queued/active. */
  singletonKey?: string;
  priority?: number;
}

/** Enqueues a registered background job. Returns the job id (or null when de-duplicated). */
export async function enqueueJob<TData>(
  name: string,
  data: TData,
  options: EnqueueOptions = {},
): Promise<string | null> {
  const definition = getServerRegistry().job(name);
  if (!definition) {
    throw new Error(`Unknown job "${name}". Register it in a module's server manifest.`);
  }
  const payload = definition.schema ? definition.schema.parse(data) : data;
  const boss = await getBoss();
  // pg-boss validates every provided key, so unset options must be omitted rather than passed as undefined.
  const sendOptions: SendOptions = {};
  if (options.startAfter !== undefined) sendOptions.startAfter = options.startAfter;
  if (options.singletonKey !== undefined) sendOptions.singletonKey = options.singletonKey;
  if (options.priority !== undefined) sendOptions.priority = options.priority;
  if (options.tx) sendOptions.db = fromPrisma(options.tx);
  return boss.send(name, (payload ?? {}) as object, sendOptions);
}
