import { fromPrisma } from "pg-boss";

import { type Prisma } from "@/generated/prisma/client";
import { getServerRegistry } from "@/modules/registry.server";
import type { TenantTx } from "@/platform/db/tenant-scope";
import { getBoss } from "@/platform/jobs/boss";
import type { ServiceContext } from "@/platform/tenant/context";

import { eventHandlerQueueName } from "./define";
import type { DomainEvent, DomainEventMap, DomainEventType } from "./types";

/** Job payload delivered to event-handler queues. */
export interface EventJobData<TType extends DomainEventType = DomainEventType> {
  event: DomainEvent<TType>;
}

/**
 * Publishes a domain event (transactional outbox, M01-12).
 *
 * Must be called with the transaction that performs the change. In that same transaction it
 *   1. appends the event to `outbox_events` (durable event log), and
 *   2. enqueues one pg-boss job per subscribed handler.
 * If the transaction rolls back, neither the event nor the jobs exist; if it commits, every handler is
 * guaranteed to run (with retries) in the worker.
 */
export async function publishEvent<TType extends DomainEventType>(
  tx: TenantTx,
  ctx: ServiceContext,
  type: TType,
  payload: DomainEventMap[TType],
): Promise<DomainEvent<TType>> {
  const handlers = getServerRegistry().handlersFor(type);

  const row = await tx.outboxEvent.create({
    data: {
      organizationId: ctx.organizationId,
      type,
      payload: payload as Prisma.InputJsonValue,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      requestId: ctx.requestId,
      dispatchedTo: handlers.map((handler) => handler.name),
    },
  });

  const event: DomainEvent<TType> = {
    id: row.id,
    type,
    organizationId: ctx.organizationId,
    payload,
    actor: ctx.actor,
    requestId: ctx.requestId,
    occurredAt: row.occurredAt.toISOString(),
  };

  if (handlers.length > 0) {
    const boss = await getBoss();
    const db = fromPrisma(tx);
    for (const handler of handlers) {
      const data: EventJobData<TType> = { event };
      await boss.send(eventHandlerQueueName(handler.name), data as unknown as object, { db });
    }
  }

  return event;
}
