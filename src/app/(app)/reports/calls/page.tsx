import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { BarList } from "@/components/shared/charts/bar-list";
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
import { callsByOutcome, callsTable } from "@/modules/analytics/server/reports/activity";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Calling report" };

const loadParams = createLoader(reportSearchParams);

/** Calling report (M10-11): volume, connect rate and outcomes by executive and day. */
export default async function CallsReportPage({ searchParams }: PageProps<"/reports/calls">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const [summary, series, members, outcomes] = await Promise.all([
    getMetricSummary(ctx, resolved.filters, resolved.scope),
    getMetricSeries(ctx, resolved.filters, resolved.period.granularity, resolved.scope),
    getMemberMetrics(ctx, resolved.filters, resolved.scope),
    callsByOutcome(ctx, resolved),
  ]);
  const c = summary.current;
  const n = (value: number) => value.toLocaleString("en-IN");
  const withCalls = members.filter((member) => member.values.calls > 0);
  return (
    <ReportShell
      report="calls"
      title="Calling"
      description="How many calls were made, how many connected, and how they went."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
      granularity
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Calls" value={n(c.calls)} change={summary.change.calls} />
        <StatTile
          label="Connected"
          value={n(c.callsConnected)}
          change={summary.change.callsConnected}
          hint={`${c.connectRate ?? 0}% connect rate`}
        />
        <StatTile
          label="Positive"
          value={n(c.callsPositive)}
          change={summary.change.callsPositive}
        />
        <StatTile
          label="Talk time"
          value={`${Math.round(c.talkSeconds / 60).toLocaleString("en-IN")} min`}
          change={summary.change.talkSeconds}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calls per {resolved.period.granularity}</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnChart
              title="Calls over time"
              data={series.map((point) => ({
                key: point.key,
                label: point.label,
                values: {
                  connected: point.values.callsConnected,
                  notConnected: point.values.calls - point.values.callsConnected,
                },
              }))}
              series={[
                { key: "connected", label: "Connected", slot: 1 },
                { key: "notConnected", label: "Not connected", slot: 2 },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              title="Calls by outcome"
              items={outcomes.map((outcome) => ({
                key: outcome.key,
                label: outcome.label,
                values: [outcome.count],
                display: `${n(outcome.count)} · ${c.calls ? Math.round((outcome.count / c.calls) * 100) : 0}%`,
              }))}
              empty="No calls in this period."
            />
          </CardContent>
        </Card>
      </div>
      <ReportTable
        report={callsTable(withCalls)}
        hrefs={withCalls.map(
          (member) =>
            `/calls?caller=${member.memberId}&from=${resolved.period.range.from}&to=${resolved.period.range.to}`,
        )}
        empty="No calls in this period."
      />
    </ReportShell>
  );
}
