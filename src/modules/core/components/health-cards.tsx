import { Database, HardDrive, Server } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, type RegionalFormatSettings } from "@/lib/format";
import type { HealthCheck, HealthReport, HealthStatus } from "@/platform/health";

const TONE: Record<HealthStatus, StatusTone> = {
  ok: "success",
  degraded: "warning",
  down: "destructive",
};
const LABEL: Record<HealthStatus, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Unavailable",
};

function HealthCard({
  title,
  description,
  icon: Icon,
  check,
  extra,
}: {
  title: string;
  description: string;
  icon: typeof Database;
  check: HealthCheck;
  extra?: string;
}) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        <StatusBadge label={LABEL[check.status]} tone={TONE[check.status]} className="mb-2" />
        {check.latencyMs !== undefined ? <p>Response time: {check.latencyMs} ms</p> : null}
        {extra ? <p>{extra}</p> : null}
        {check.detail ? <p>{check.detail}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Health of the platform services (M01-17), rendered on Settings → System status. */
export function HealthCards({
  report,
  regional,
}: {
  report: HealthReport;
  regional: RegionalFormatSettings;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <HealthCard
        title="Database"
        description="PostgreSQL"
        icon={Database}
        check={report.checks.database}
      />
      <HealthCard
        title="File storage"
        description="S3-compatible object store"
        icon={HardDrive}
        check={report.checks.storage}
      />
      <HealthCard
        title="Background worker"
        description="Jobs, reminders and e-mails"
        icon={Server}
        check={report.checks.worker}
        extra={
          report.checks.worker.lastSeenAt
            ? `Last heartbeat: ${formatDateTime(report.checks.worker.lastSeenAt, regional)}`
            : undefined
        }
      />
    </div>
  );
}
