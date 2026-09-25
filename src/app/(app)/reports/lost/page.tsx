import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { BarList } from "@/components/shared/charts/bar-list";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import {
  type LostBreakdownRow,
  lostReport,
  lostTable,
} from "@/modules/analytics/server/reports/deals";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lost lead report" };

const loadParams = createLoader(reportSearchParams);

const bars = (title: string, rows: LostBreakdownRow[]) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <BarList
        title={title}
        segments={[
          { label: "Lost", slot: 1 },
          { label: "Not interested", slot: 2 },
        ]}
        items={rows.slice(0, 15).map((row) => ({
          key: row.key,
          label: row.label,
          values: [row.lost, row.notInterested],
        }))}
        empty="No leads lost in this period."
      />
    </CardContent>
  </Card>
);

/** Lost lead report with loss reasons (M10-15). */
export default async function LostReportPage({ searchParams }: PageProps<"/reports/lost">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const data = await lostReport(ctx, resolved);
  const n = (value: number) => value.toLocaleString("en-IN");
  const top = data.byReason[0];
  return (
    <ReportShell
      report="lost"
      title="Lost leads"
      description="Leads closed as lost or not interested in the period, and why."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Lost" value={n(data.lost)} />
        <StatTile label="Not interested" value={n(data.notInterested)} />
        <StatTile
          label="Top reason"
          value={top ? top.label : "—"}
          hint={top ? `${n(top.lost + top.notInterested)} leads` : undefined}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        {bars("By reason", data.byReason)}
        {bars("By owner", data.byOwner)}
        {bars("By source", data.bySource)}
      </div>
      <ReportTable
        report={lostTable(data.recent)}
        hrefs={data.recent.map((lead) => `/leads/${lead.id}`)}
        empty="No leads lost in this period."
      />
      {data.recent.length === 200 ? (
        <p className="text-xs text-muted-foreground">
          The latest 200 are listed; the export has them all.
        </p>
      ) : null}
    </ReportShell>
  );
}
