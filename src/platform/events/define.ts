import type { QueueOptions } from "pg-boss";

import type { ServiceContext } from "@/platform/tenant/context";

import type { DomainEvent, DomainEventType } from "./types";

/**
 * Subscribes a handler to a domain event. Each handler gets its own queue (`evt.<name>`), so handlers are
 * retried independently. Handlers run in the worker with a system context for the event's organization and
 * must be idempotent (use `event.id` to de-duplicate side effects when needed).
 */
export interface EventHandlerDefinition<TType extends DomainEventType = DomainEventType> {
  /** Unique, stable handler name, e.g. `notifications.lead-assigned`. */
  name: string;
  event: TType;
  handle: (event: DomainEvent<TType>, ctx: ServiceContext) => Promise<void>;
  queue?: QueueOptions;
}

export function defineEventHandler<TType extends DomainEventType>(
  definition: EventHandlerDefinition<TType>,
): EventHandlerDefinition<TType> {
  return definition;
}

export function eventHandlerQueueName(handlerName: string): string {
  return `evt.${handlerName}`;
}
