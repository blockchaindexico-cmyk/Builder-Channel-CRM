import { ArrowRight, History } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

import { ASSIGNMENT_METHODS } from "../constants";
import { listAssignmentHistory } from "../server/assign";

const KIND_LABELS = { ASSIGN: "Assigned", REASSIGN: "Reassigned", UNASSIGN: "Unassigned" } as const;

/** Every owner change of a lead with who, when, how and why (M05-04, PRD §7). */
export async function AssignmentHistoryPanel({ leadId }: { leadId: string }) {
  const ctx = await getRequestContext();
  const [rows, regional] = await Promise.all([
    listAssignmentHistory(ctx, leadId),
    getRegionalSettings(ctx),
  ]);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Never assigned"
        description="The lead is waiting in the unassigned queue."
      />
    );
  }
  return (
    <ol className="divide-y rounded-lg border" aria-label="Assignment history">
      {rows.map((row) => (
        <li key={row.id} className="space-y-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                row.kind === "REASSIGN" ? "warning" : row.kind === "ASSIGN" ? "info" : "muted"
              }
            >
              {KIND_LABELS[row.kind]}
            </Badge>
            {row.previousOwnerName ? (
              <>
                <span>{row.previousOwnerName}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </>
            ) : null}
            <span className="font-medium">{row.assigneeName ?? "Unassigned queue"}</span>
            {!row.endedAt && row.assigneeName ? <Badge variant="success">Current</Badge> : null}
          </div>
          {row.reason || row.reasonLabel ? (
            <p className="text-muted-foreground">
              {row.reasonLabel ? <span className="font-medium">{row.reasonLabel}: </span> : null}
              {row.reason ? `“${row.reason}”` : null}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {ASSIGNMENT_METHODS.find((method) => method.value === row.method)?.label}
            {row.ruleName ? ` “${row.ruleName}”` : ""} · by {row.assignedByName} ·{" "}
            {formatDateTime(row.assignedAt, regional)} (<RelativeTime value={row.assignedAt} />)
            {row.endedAt ? ` · until ${formatDateTime(row.endedAt, regional)}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
