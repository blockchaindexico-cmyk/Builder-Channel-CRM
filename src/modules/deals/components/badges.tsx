import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type {
  BookingStatus,
  SiteVisitStatus,
  VisitOutcomeCategory,
} from "@/generated/prisma/enums";

const VISIT_TONES: Record<SiteVisitStatus, { label: string; tone: StatusTone }> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  CONFIRMED: { label: "Confirmed", tone: "default" },
  COMPLETED: { label: "Done", tone: "success" },
  NO_SHOW: { label: "No-show", tone: "destructive" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
  RESCHEDULED: { label: "Moved", tone: "muted" },
};

/** A visit's state; an open visit past its time is "waiting for its outcome". */
export function VisitStatusBadge({
  status,
  pending = false,
}: {
  status: SiteVisitStatus;
  pending?: boolean;
}) {
  if (pending && (status === "SCHEDULED" || status === "CONFIRMED")) {
    return <StatusBadge label="Outcome pending" tone="warning" />;
  }
  const entry = VISIT_TONES[status];
  return <StatusBadge label={entry.label} tone={entry.tone} />;
}

/** Visit or revisit, with its number. */
export function VisitKindBadge({ label, isRevisit }: { label: string; isRevisit: boolean }) {
  return <StatusBadge label={label} tone={isRevisit ? "default" : "outline"} />;
}

const OUTCOME_TONES: Record<VisitOutcomeCategory, StatusTone> = {
  BOOKING: "success",
  POSITIVE: "success",
  NEUTRAL: "secondary",
  NEGATIVE: "warning",
};

export function VisitOutcomeBadge({ label, category }: { label: string; category: string }) {
  return (
    <StatusBadge label={label} tone={OUTCOME_TONES[category as VisitOutcomeCategory] ?? "muted"} />
  );
}

const BOOKING_TONES: Record<BookingStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "In progress", tone: "info" },
  CLOSED_WON: { label: "Closed / Won", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "destructive" },
};

export function BookingStatusBadge({
  status,
  stage,
}: {
  status: BookingStatus;
  stage?: string | null;
}) {
  const entry = BOOKING_TONES[status];
  return (
    <StatusBadge label={status === "ACTIVE" && stage ? stage : entry.label} tone={entry.tone} />
  );
}
