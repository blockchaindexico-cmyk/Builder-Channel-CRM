import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BookingStatusBadge } from "@/modules/deals/components/badges";
import { BookingActions } from "@/modules/deals/components/booking-actions";
import { BookingDocuments } from "@/modules/deals/components/booking-documents";
import { DEAL_PERMISSIONS } from "@/modules/deals/permissions";
import { type BookingDetail, getBooking } from "@/modules/deals/server/bookings";
import { listBookingStages } from "@/modules/deals/server/masters";
import { getRegionalSettings } from "@/modules/organization";
import { loadOrNotFound, routeId } from "@/platform/pages";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Booking" };

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">
            {value ?? <span className="text-muted-foreground">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const HISTORY_LABELS: Record<BookingDetail["history"][number]["type"], string> = {
  CREATED: "Booking created",
  UPDATED: "Details changed",
  STAGE_CHANGED: "Stage",
  CLOSED: "Closed / Won",
  CANCELLED: "Cancelled",
  FILE_ADDED: "Document added",
  FILE_REMOVED: "Document removed",
};

/** Progress through the organization's stages to Closed / Won (Q-09). */
function StageProgress({
  booking,
  stages,
}: {
  booking: BookingDetail;
  stages: { id: string; label: string }[];
}) {
  const steps = [
    ...stages,
    ...(booking.stage && !stages.some((stage) => stage.id === booking.stage!.id)
      ? [booking.stage]
      : []),
  ];
  const currentIndex =
    booking.status === "CLOSED_WON"
      ? steps.length
      : steps.findIndex((stage) => stage.id === booking.stage?.id);
  const all = [...steps.map((stage) => stage.label), "Closed / Won"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Booking progress">
      {all.map((label, index) => {
        const done = booking.status !== "CANCELLED" && index < currentIndex;
        const current = booking.status !== "CANCELLED" && index === currentIndex;
        return (
          <li key={`${label}-${index}`} className="flex items-center gap-2">
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1",
                done && "border-success/40 bg-success/10 text-success",
                current && "border-primary bg-primary text-primary-foreground",
                booking.status === "CANCELLED" && "text-muted-foreground line-through",
              )}
            >
              {done ? <Check className="size-3.5" /> : null}
              {label}
            </span>
            {index < all.length - 1 ? <span className="h-px w-4 bg-border" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A booking (M08-08): unit, customer, values (with permission), progress, documents and full history. */
export default async function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, DEAL_PERMISSIONS.bookingsView);
  const booking = await loadOrNotFound(getBooking(ctx, routeId((await params).id)));
  const [regional, stages] = await Promise.all([
    getRegionalSettings(ctx),
    listBookingStages(ctx, { activeOnly: true }),
  ]);
  const money = (value: string | null) => (value ? formatMoney(value, regional) : null);
  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            Booking {booking.number}
            <BookingStatusBadge status={booking.status} stage={booking.stage?.label} />
          </span>
        }
        description={`${booking.customerName} · ${booking.project.name} · booked ${formatCalendarDate(booking.bookingDate, regional)}`}
        breadcrumbs={[{ label: "Bookings", href: "/bookings" }, { label: booking.number }]}
        actions={
          <BookingActions
            booking={{
              id: booking.id,
              number: booking.number,
              status: booking.status,
              stageId: booking.stage?.id ?? null,
            }}
            stages={stages.map((stage) => ({ id: stage.id, label: stage.label }))}
            canManage={booking.permissions.canManage}
            canClose={booking.permissions.canClose}
          />
        }
      />
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-3">
            <StageProgress booking={booking} stages={stages} />
            {booking.status === "CLOSED_WON" ? (
              <p className="text-sm text-muted-foreground">
                Closed by {booking.closedByName} on {formatDateTime(booking.closedAt, regional)}.
              </p>
            ) : null}
            {booking.status === "CANCELLED" ? (
              <p className="text-sm">
                <span className="font-medium text-destructive">Cancelled</span> by{" "}
                {booking.cancelledByName} on {formatDateTime(booking.cancelledAt, regional)}:{" "}
                {booking.cancelReason?.label}
                {booking.cancelNotes ? ` — ${booking.cancelNotes}` : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Unit</CardTitle>
            </CardHeader>
            <CardContent>
              <Facts
                items={[
                  [
                    "Project",
                    <span key="project">
                      {booking.project.name}
                      <span className="text-muted-foreground"> · {booking.builder.name}</span>
                    </span>,
                  ],
                  ["Tower / wing", booking.tower],
                  ["Unit", booking.unitNumber],
                  ["Floor", booking.floor],
                  ["Configuration", booking.configuration],
                  ["Carpet area", booking.area ? `${booking.area} sq ft` : null],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent>
              <Facts
                items={[
                  ["Customer", booking.customerName],
                  ["Co-applicant", booking.coApplicantName],
                  [
                    "Lead",
                    <Link
                      key="lead"
                      href={`/leads/${booking.lead.id}`}
                      className="text-primary hover:underline"
                    >
                      {booking.lead.number} · {booking.lead.name}
                    </Link>,
                  ],
                  ["Credited to", booking.executive.name],
                  ["Manager", booking.manager?.name ?? null],
                  [
                    "After",
                    booking.visit
                      ? `${booking.visit.label} · ${formatDateTime(booking.visit.scheduledAt, regional)}`
                      : null,
                  ],
                  ["Created by", booking.createdByName],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Facts
                items={[
                  ...(booking.valuesHidden
                    ? []
                    : ([
                        ["Agreement value", money(booking.agreementValue)],
                        ["Token amount", money(booking.tokenAmount)],
                      ] as [string, React.ReactNode][])),
                  ["Payment plan", booking.paymentPlan],
                  ["Builder's reference", booking.builderReference],
                ]}
              />
              {booking.valuesHidden ? (
                <p className="text-xs text-muted-foreground">
                  Booking values are visible to authorized people only.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {booking.remarks ? (
          <Card>
            <CardHeader>
              <CardTitle>Remarks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-line">{booking.remarks}</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingDocuments
                bookingId={booking.id}
                files={booking.files}
                canWrite={booking.permissions.canManage && booking.status !== "CANCELLED"}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4" aria-label="Booking history">
                {booking.history.map((entry) => (
                  <li key={entry.id} className="border-l-2 pl-3 text-sm">
                    <p className="font-medium">
                      {HISTORY_LABELS[entry.type]}
                      {entry.type === "STAGE_CHANGED"
                        ? `: ${entry.fromStage ?? "—"} → ${entry.toStage}`
                        : entry.type === "CREATED" && entry.toStage
                          ? ` · ${entry.toStage}`
                          : ""}
                    </p>
                    {entry.changes.length ? (
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {entry.changes.map((change) => (
                          <li key={change.field}>
                            {change.label}:{" "}
                            {change.hidden ? (
                              <span className="italic">changed (hidden)</span>
                            ) : (
                              <>
                                {change.from ?? "—"} → {change.to ?? "—"}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {entry.note ? <p className="mt-1 whitespace-pre-line">{entry.note}</p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.actorName} · {formatDateTime(entry.occurredAt, regional)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
