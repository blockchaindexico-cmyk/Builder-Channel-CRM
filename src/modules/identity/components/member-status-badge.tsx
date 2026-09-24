import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INVITED: { label: "Invited", tone: "info" },
  INACTIVE: { label: "Deactivated", tone: "muted" },
};

export function MemberStatusBadge({ status }: { status: string }) {
  const config = STATUS[status] ?? { label: status, tone: "muted" as StatusTone };
  return <StatusBadge label={config.label} tone={config.tone} />;
}
