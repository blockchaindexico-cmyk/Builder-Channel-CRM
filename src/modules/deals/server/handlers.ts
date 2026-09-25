import { defineEventHandler } from "@/platform/events/define";
import type { DomainEvent, DomainEventType } from "@/platform/events/types";
import { PermissionSet } from "@/platform/rbac/permissions";
import { createServiceContext, type ServiceContext } from "@/platform/tenant/context";

import { transferUpcomingVisits } from "./visits";

/** Acts as the person who moved the lead, so the timeline shows who caused the transfer. */
function asEventActor(event: DomainEvent<DomainEventType>, ctx: ServiceContext): ServiceContext {
  return createServiceContext({
    organizationId: ctx.organizationId,
    actor: event.actor,
    permissions: PermissionSet.all(),
    requestId: event.requestId ?? ctx.requestId,
  });
}

/** Upcoming visits move with their lead (M08-13); bookings keep their credited executive (Q-10). */
export const visitsOnAssign = defineEventHandler({
  name: "deals.visits-on-assign",
  event: "lead.assigned",
  handle: async (event, ctx) => {
    await transferUpcomingVisits(
      asEventActor(event, ctx),
      event.payload.leadId,
      event.payload.assigneeId,
    );
  },
});

export const visitsOnReassign = defineEventHandler({
  name: "deals.visits-on-reassign",
  event: "lead.reassigned",
  handle: async (event, ctx) => {
    await transferUpcomingVisits(
      asEventActor(event, ctx),
      event.payload.leadId,
      event.payload.assigneeId,
    );
  },
});

export const visitsOnUnassign = defineEventHandler({
  name: "deals.visits-on-unassign",
  event: "lead.unassigned",
  handle: async (event, ctx) => {
    await transferUpcomingVisits(asEventActor(event, ctx), event.payload.leadId, null);
  },
});

export const dealEventHandlers = [visitsOnAssign, visitsOnReassign, visitsOnUnassign];
