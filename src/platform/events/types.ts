import type { Actor } from "@/platform/tenant/context";

/**
 * Typed domain-event catalogue (BUILD_PLAN §2.2 rule 5).
 *
 * Modules add their events with declaration merging, e.g.
 *
 * ```ts
 * declare module "@/platform/events/types" {
 *   interface DomainEventMap {
 *     "lead.created": { leadId: string };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DomainEventMap {}

export type DomainEventType = keyof DomainEventMap & string;

export interface DomainEvent<TType extends DomainEventType = DomainEventType> {
  id: string;
  type: TType;
  organizationId: string;
  payload: DomainEventMap[TType];
  actor: Actor;
  requestId: string | null;
  occurredAt: string;
}
