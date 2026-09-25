import { defineEventHandler } from "@/platform/events/define";
import type { DomainEvent, DomainEventType } from "@/platform/events/types";
import { PermissionSet } from "@/platform/rbac/permissions";
import { createServiceContext, type ServiceContext } from "@/platform/tenant/context";

import { transferOpenFollowUps } from "./follow-ups";

/** Acts as the person who moved the lead, so the timeline shows who caused the transfer. */
function asEventActor(event: DomainEvent<DomainEventType>, ctx: ServiceContext): ServiceContext {
  return createServiceContext({
    organizationId: ctx.organizationId,
    actor: event.actor,
    permissions: PermissionSet.all(),
    requestId: event.requestId ?? ctx.requestId,
  });
}

/** Open follow-ups and callbacks move with their lead (M07-17). */
export const transferOnAssign = defineEventHandler({
  name: "activities.follow-ups-on-assign",
  event: "lead.assigned",
  handle: async (event, ctx) => {
    await transferOpenFollowUps(
      asEventActor(event, ctx),
      event.payload.leadId,
      event.payload.assigneeId,
    );
  },
});

export const transferOnReassign = defineEventHandler({
  name: "activities.follow-ups-on-reassign",
  event: "lead.reassigned",
  handle: async (event, ctx) => {
    await transferOpenFollowUps(
      asEventActor(event, ctx),
      event.payload.leadId,
      event.payload.assigneeId,
    );
  },
});

export const transferOnUnassign = defineEventHandler({
  name: "activities.follow-ups-on-unassign",
  event: "lead.unassigned",
  handle: async (event, ctx) => {
    await transferOpenFollowUps(asEventActor(event, ctx), event.payload.leadId, null);
  },
});

export const activityEventHandlers = [transferOnAssign, transferOnReassign, transferOnUnassign];
