import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { CallOutcomeCategory, FollowUpStatus, FollowUpType } from "@/generated/prisma/enums";

const OUTCOME_TONES: Record<CallOutcomeCategory, StatusTone> = {
  POSITIVE: "success",
  INTERESTED: "success",
  CALLBACK: "info",
  NEUTRAL: "secondary",
  NEGATIVE: "warning",
  NOT_INTERESTED: "destructive",
  UNRESPONSIVE: "muted",
};

export function OutcomeBadge({
  label,
  category,
}: {
  label: string;
  category: CallOutcomeCategory;
}) {
  return <StatusBadge label={label} tone={OUTCOME_TONES[category]} />;
}

const FOLLOW_UP_TONES: Record<FollowUpStatus, { label: string; tone: StatusTone }> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  MISSED: { label: "Missed", tone: "destructive" },
  COMPLETED: { label: "Done", tone: "success" },
  RESCHEDULED: { label: "Moved", tone: "muted" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export function FollowUpStatusBadge({
  status,
  overdue = false,
}: {
  status: FollowUpStatus;
  overdue?: boolean;
}) {
  if (status === "SCHEDULED" && overdue) return <StatusBadge label="Overdue" tone="warning" />;
  const entry = FOLLOW_UP_TONES[status];
  return <StatusBadge label={entry.label} tone={entry.tone} />;
}

/** Callbacks are requested by the customer and shown apart from ordinary follow-ups (PRD §9). */
export function FollowUpTypeBadge({ type }: { type: FollowUpType }) {
  return type === "CALLBACK" ? (
    <StatusBadge label="Callback" tone="default" />
  ) : (
    <StatusBadge label="Follow-up" tone="outline" />
  );
}
