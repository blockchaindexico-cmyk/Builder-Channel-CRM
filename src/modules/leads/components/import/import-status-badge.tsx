import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import type { ImportStatus } from "@/generated/prisma/enums";

const STATUS: Record<ImportStatus, { label: string; tone: StatusTone }> = {
  QUEUED: { label: "Waiting", tone: "muted" },
  PROCESSING: { label: "Importing", tone: "info" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "destructive" },
};

export function ImportStatusBadge({ status }: { status: ImportStatus }) {
  return <StatusBadge label={STATUS[status].label} tone={STATUS[status].tone} />;
}
