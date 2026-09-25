import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { ColumnChart } from "@/components/shared/charts/column-chart";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import {
  getMemberMetrics,
  getMetricSeries,
  getMetricSummary,
} from "@/modules/analytics/server/metrics";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import { followUpsTable, openFollowUps } from "@/modules/analytics/server/reports/activity";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Follow-up report" };

const loadParams = createLoader(reportSearchParams);

/** Follow-up report (M10-12): upcoming, completed, missed and overdue, with adherence. */
export default async function FollowUpsReportPage({
  searchParams,
}: PageProps<"/reports/follow-ups">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const [summary, series, members, open] = await Promise.all([
    getMetricSummary(ctx, resolved.filters, resolved.scope),
    getMetricSeries(ctx, resolved.filters, resolved.period.granularity, resolved.scope),
    getMemberMetrics(ctx, resolved.filters, resolved.scope),
    openFollowUps(ctx, resolved),
  ]);
  const c = summary.current;
  const n = (value: number) => value.toLocaleString("en-IN");
  const upcoming = open.reduce((total, row) => total + row.upcoming, 0);
  const overdue = open.reduce((total, row) => total + row.overdue, 0);
  const shown = members.filter(
    (member) =>
      member.values.followUpsDue +
        member.values.followUpsCompleted +
        member.values.followUpsMissed >
        0 || open.some((row) => row.memberId === member.memberId),
  );
  return (
    <ReportShell
      report="follow-ups"
      title="Follow-ups"
      description="Follow-ups and callbacks: done, done on time, missed — and what is still open now."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
      granularity
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Due"
          value={n(c.followUpsDue)}
          change={summary.change.followUpsDue}
          higherIsBetter={null}
        />
        <StatTile
          label="Done"
          value={n(c.followUpsCompleted)}
          change={summary.change.followUpsCompleted}
        />
        <StatTile
          label="Adherence"
          value={c.followUpAdherence === null ? "—" : `${c.followUpAdherence}%`}
          hint={`${n(c.followUpsOnTime)} of ${n(c.followUpsDue)} done on time`}
        />
        <StatTile
          label="Missed"
          value={n(c.followUpsMissed)}
          change={summary.change.followUpsMissed}
          higherIsBetter={false}
        />
        <StatTile
          label="Open now"
          value={n(upcoming + overdue)}
          hint={`${n(overdue)} overdue`}
          href="/team/follow-ups"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Done and missed per {resolved.period.granularity}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnChart
            title="Follow-ups over time"
            data={series.map((point) => ({
              key: point.key,
              label: point.label,
              values: {
                done: point.values.followUpsCompleted,
                missed: point.values.followUpsMissed,
              },
            }))}
            series={[
              { key: "done", label: "Done", slot: 1 },
              { key: "missed", label: "Missed", slot: 2 },
            ]}
          />
        </CardContent>
      </Card>
      <ReportTable report={followUpsTable(shown, open)} empty="No follow-ups in this period." />
    </ReportShell>
  );
}
