import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

import { PROJECT_STATUSES } from "../../schemas";

export function ProjectStatusBadge({ status }: { status: string }) {
  const entry = PROJECT_STATUSES.find((item) => item.value === status);
  return (
    <StatusBadge label={entry?.label ?? status} tone={(entry?.tone ?? "muted") as StatusTone} />
  );
}

export function InactiveBadge() {
  return <StatusBadge label="Inactive" tone="muted" />;
}
