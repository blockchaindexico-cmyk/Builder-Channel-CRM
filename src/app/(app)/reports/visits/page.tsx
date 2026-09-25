import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { BarList } from "@/components/shared/charts/bar-list";
import { ColumnChart } from "@/components/shared/charts/column-chart";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ratio } from "@/modules/analytics/metrics";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import { getProjectPerformance } from "@/modules/analytics/server/insights";
import {
  getMemberMetrics,
  getMetricSeries,
  getMetricSummary,
} from "@/modules/analytics/server/metrics";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import {
  visitConversion,
  visitsByOutcome,
  visitsTable,
} from "@/modules/analytics/server/reports/activity";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Site visit report" };

const loadParams = createLoader(reportSearchParams);

/** Visit report (M10-13): visits, revisits, outcomes and visit → booking / closure conversion. */
export default async function VisitsReportPage({ searchParams }: PageProps<"/reports/visits">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const [summary, series, members, outcomes, conversion, projects] = await Promise.all([
    getMetricSummary(ctx, resolved.filters, resolved.scope),
    getMetricSeries(ctx, resolved.filters, resolved.period.granularity, resolved.scope),
    getMemberMetrics(ctx, resolved.filters, resolved.scope),
    visitsByOutcome(ctx, resolved),
    visitConversion(ctx, resolved),
    getProjectPerformance(ctx, resolved.filters, resolved.scope),
  ]);
  const c = summary.current;
  const n = (value: number) => value.toLocaleString("en-IN");
  const pct = (value: number | null) => (value === null ? "—" : `${value}%`);
  const shown = members.filter(
    (member) =>
      member.values.visitsCompleted + member.values.revisitsCompleted + member.values.visitsNoShow >
      0,
  );
  return (
    <ReportShell
      report="visits"
      title="Site visits"
      description="Visits and revisits done, their outcomes, and how visitors went on to book."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
      granularity
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="First visits"
          value={n(c.visitsCompleted)}
          change={summary.change.visitsCompleted}
        />
        <StatTile
          label="Revisits"
          value={n(c.revisitsCompleted)}
          change={summary.change.revisitsCompleted}
        />
        <StatTile
          label="No-shows"
          value={n(c.visitsNoShow)}
          change={summary.change.visitsNoShow}
          higherIsBetter={false}
        />
        <StatTile
          label="Visit → booking"
          value={pct(ratio(conversion.booked, conversion.visited))}
          hint={`${n(conversion.booked)} of ${n(conversion.visited)} leads first visiting in the period`}
        />
        <StatTile
          label="Visit → closure"
          value={pct(ratio(conversion.won, conversion.visited))}
          hint={`${n(conversion.won)} closed / won so far`}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Visits per {resolved.period.granularity}</CardTitle>
          </CardHeader>
          <CardContent>
            <ColumnChart
              title="Visits over time"
              data={series.map((point) => ({
                key: point.key,
                label: point.label,
                values: {
                  visits: point.values.visitsCompleted,
                  revisits: point.values.revisitsCompleted,
                },
              }))}
              series={[
                { key: "visits", label: "First visits", slot: 1 },
                { key: "revisits", label: "Revisits", slot: 2 },
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
              title="Visits by outcome"
              items={outcomes.map((outcome) => ({
                key: outcome.key,
                label: outcome.label,
                values: [outcome.count],
              }))}
              empty="No visits done in this period."
            />
          </CardContent>
        </Card>
      </div>
      {projects.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By project</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              title="Visits by project"
              segments={[
                { label: "First visits", slot: 1 },
                { label: "Revisits", slot: 2 },
              ]}
              items={projects
                .filter((project) => project.visits + project.revisits > 0)
                .map((project) => ({
                  key: project.projectId,
                  label: project.projectName,
                  hint: project.builderName,
                  values: [project.visits, project.revisits],
                  display: `${n(project.visits + project.revisits)} · ${n(project.bookings)} booked`,
                }))}
              empty="No visits done in this period."
            />
          </CardContent>
        </Card>
      ) : null}
      <ReportTable report={visitsTable(shown)} empty="No visits in this period." />
    </ReportShell>
  );
}
