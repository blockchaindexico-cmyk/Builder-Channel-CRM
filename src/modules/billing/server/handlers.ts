import { defineEventHandler } from "@/platform/events/define";
import type { DomainEvent, DomainEventType } from "@/platform/events/types";
import { PermissionSet } from "@/platform/rbac/permissions";
import { createServiceContext, type ServiceContext } from "@/platform/tenant/context";

import {
  cancelDealFinancial,
  createDealFinancialForBooking,
  syncDealFinancial,
} from "./financials";

/** Acts as the person who changed the booking, so deal history shows who caused the change. */
function asEventActor(event: DomainEvent<DomainEventType>, ctx: ServiceContext): ServiceContext {
  return createServiceContext({
    organizationId: ctx.organizationId,
    actor: event.actor,
    permissions: PermissionSet.all(),
    requestId: event.requestId ?? ctx.requestId,
  });
}

/** A closed/won booking gets its deal financials, with the commission of the rate card in force (M09-05). */
export const dealOnBookingClosed = defineEventHandler({
  name: "billing.deal-on-booking-closed",
  event: "booking.closed",
  handle: async (event, ctx) => {
    await createDealFinancialForBooking(asEventActor(event, ctx), event.payload.bookingId);
  },
});

/** Booking edits flow into draft financials (value, project, executive); confirmed ones keep their numbers. */
export const dealOnBookingUpdated = defineEventHandler({
  name: "billing.deal-on-booking-updated",
  event: "booking.updated",
  handle: async (event, ctx) => {
    await syncDealFinancial(asEventActor(event, ctx), event.payload.bookingId);
  },
});

export const dealOnBookingCancelled = defineEventHandler({
  name: "billing.deal-on-booking-cancelled",
  event: "booking.cancelled",
  handle: async (event, ctx) => {
    await cancelDealFinancial(asEventActor(event, ctx), event.payload.bookingId);
  },
});

export const billingEventHandlers = [
  dealOnBookingClosed,
  dealOnBookingUpdated,
  dealOnBookingCancelled,
];
