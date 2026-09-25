import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { BookingForm } from "@/modules/deals/components/booking-form";
import { DEAL_PERMISSIONS } from "@/modules/deals/permissions";
import { getBooking, getBookingFormOptions } from "@/modules/deals/server/bookings";
import { ForbiddenError } from "@/platform/errors";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Edit booking" };

/** Edit a booking's details (M08-09); every change goes to its history. */
export default async function EditBookingPage({ params }: PageProps<"/bookings/[id]/edit">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, DEAL_PERMISSIONS.bookingsManage);
  const booking = await loadOrNotFound(getBooking(ctx, routeId((await params).id)));
  if (!booking.permissions.canManage || booking.status === "CANCELLED") {
    throw new ForbiddenError(undefined, DEAL_PERMISSIONS.bookingsManage);
  }
  const { options } = await getBookingFormOptions(ctx, booking.lead.id, {
    projectId: booking.project.id,
    executiveId: booking.executive.id,
  });
  const executives = options.executives.some((member) => member.id === booking.executive.id)
    ? options.executives
    : options.executives.length
      ? [...options.executives, { id: booking.executive.id, name: booking.executive.name }]
      : [];
  return (
    <>
      <PageHeader
        title={`Edit booking ${booking.number}`}
        description={`${booking.lead.number} · ${booking.customerName}`}
        breadcrumbs={[
          { label: "Bookings", href: "/bookings" },
          { label: booking.number, href: `/bookings/${booking.id}` },
          { label: "Edit" },
        ]}
      />
      <BookingForm
        mode="edit"
        leadId={booking.lead.id}
        bookingId={booking.id}
        options={{ ...options, executives }}
        initial={{
          projectId: booking.project.id,
          executiveId: executives.length ? booking.executive.id : "",
          visitId: "",
          customerName: booking.customerName,
          coApplicantName: booking.coApplicantName ?? "",
          unitNumber: booking.unitNumber ?? "",
          tower: booking.tower ?? "",
          floor: booking.floor ?? "",
          configurationTypeId: booking.configurationTypeId ?? "",
          area: booking.area ?? "",
          bookingDate: booking.bookingDate,
          agreementValue: booking.agreementValue ?? "",
          tokenAmount: booking.tokenAmount ?? "",
          paymentPlan: booking.paymentPlan ?? "",
          builderReference: booking.builderReference ?? "",
          remarks: booking.remarks ?? "",
        }}
      />
    </>
  );
}
