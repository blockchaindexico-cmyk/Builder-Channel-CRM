import type { EventHandlerDefinition } from "@/platform/events/define";
import type { DomainEventType } from "@/platform/events/types";
import type { JobDefinition } from "@/platform/jobs/define";
import type { FilePurpose } from "@/platform/storage/purposes";

/**
 * Server-side contributions of a module: background jobs and domain-event handlers.
 * Modules export one of these from `src/modules/<name>/server/index.ts`; the composition root
 * `src/modules/registry.server.ts` lists them.
 */
export interface ServerModule {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobs?: readonly JobDefinition<any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventHandlers?: readonly EventHandlerDefinition<any>[];
  filePurposes?: readonly FilePurpose[];
}

export interface ServerRegistry {
  modules: readonly ServerModule[];
  jobs: readonly JobDefinition<unknown>[];
  eventHandlers: readonly EventHandlerDefinition[];
  filePurposes: readonly FilePurpose[];
  handlersFor(type: DomainEventType): readonly EventHandlerDefinition[];
  job(name: string): JobDefinition<unknown> | undefined;
  filePurpose(key: string): FilePurpose | undefined;
}

export function buildServerRegistry(modules: readonly ServerModule[]): ServerRegistry {
  const jobs = modules.flatMap((module) => module.jobs ?? []) as JobDefinition<unknown>[];
  const eventHandlers = modules.flatMap(
    (module) => module.eventHandlers ?? [],
  ) as EventHandlerDefinition[];

  const seen = new Set<string>();
  for (const name of [
    ...jobs.map((job) => job.name),
    ...eventHandlers.map((h) => `evt.${h.name}`),
  ]) {
    if (seen.has(name)) throw new Error(`Duplicate job/handler name "${name}" in server registry.`);
    seen.add(name);
  }

  const byEvent = new Map<string, EventHandlerDefinition[]>();
  for (const handler of eventHandlers) {
    const list = byEvent.get(handler.event) ?? [];
    list.push(handler);
    byEvent.set(handler.event, list);
  }
  const jobsByName = new Map(jobs.map((job) => [job.name, job]));
  const filePurposes = modules.flatMap((module) => module.filePurposes ?? []);
  const purposesByKey = new Map<string, FilePurpose>();
  for (const purpose of filePurposes) {
    if (purposesByKey.has(purpose.key)) throw new Error(`Duplicate file purpose "${purpose.key}".`);
    purposesByKey.set(purpose.key, purpose);
  }

  return {
    modules,
    jobs,
    eventHandlers,
    filePurposes,
    handlersFor: (type) => byEvent.get(type) ?? [],
    job: (name) => jobsByName.get(name),
    filePurpose: (key) => purposesByKey.get(key),
  };
}
