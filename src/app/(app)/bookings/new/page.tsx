import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { BookingForm } from "@/modules/deals/components/booking-form";
import { DEAL_PERMISSIONS } from "@/modules/deals/permissions";
import { getBookingFormOptions } from "@/modules/deals/server/bookings";
import { findVisibleLead } from "@/modules/leads";
import { getRegionalSettings } from "@/modules/organization";
import { loadOrNotFound } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";
import { uuidOrNull } from "@/platform/validation";

export const metadata: Metadata = { title: "New booking" };

const loadParams = createLoader({ lead: parseAsString, visit: parseAsString });

/** Convert a lead to a booking (M08-07). */
export default async function NewBookingPage({ searchParams }: PageProps<"/bookings/new">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, DEAL_PERMISSIONS.bookingsManage);
  const params = await loadParams(searchParams);
  const leadId = uuidOrNull(params.lead);
  if (!leadId) notFound();
  const lead = await loadOrNotFound(
    findVisibleLead(ctx, leadId, {
      permission: DEAL_PERMISSIONS.bookingsManage,
      include: { status: true, interests: { select: { projectId: true } } },
    }),
  );
  const [{ options }, regional] = await Promise.all([
    getBookingFormOptions(ctx, lead.id),
    getRegionalSettings(ctx),
  ]);
  const visit =
    options.visits.find((entry) => entry.id === params.visit) ?? options.visits[0] ?? null;
  const interested = options.projects.filter((project) => project.interested);
  return (
    <>
      <PageHeader
        title="New booking"
        description={`${lead.number} · ${lead.name} — the lead moves to Booking and gets a booking number.`}
        breadcrumbs={[
          { label: "Leads", href: "/leads" },
          { label: lead.number, href: `/leads/${lead.id}` },
          { label: "New booking" },
        ]}
      />
      <BookingForm
        mode="create"
        leadId={lead.id}
        options={options}
        initial={{
          projectId: visit?.projectId ?? (interested.length === 1 ? interested[0]!.id : ""),
          executiveId: options.executives.length ? (lead.ownerId ?? "") : "",
          visitId: visit?.id ?? "",
          customerName: lead.name,
          coApplicantName: "",
          unitNumber: "",
          tower: "",
          floor: "",
          configurationTypeId: "",
          area: "",
          bookingDate: format(new TZDate(new Date(), regional.timezone), "yyyy-MM-dd"),
          agreementValue: "",
          tokenAmount: "",
          paymentPlan: "",
          builderReference: "",
          remarks: "",
        }}
      />
    </>
  );
}
