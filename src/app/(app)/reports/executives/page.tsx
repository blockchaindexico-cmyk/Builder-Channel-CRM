import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { BarList } from "@/components/shared/charts/bar-list";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupSelect } from "@/modules/analytics/components/group-select";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import { executivesReport, performanceTable } from "@/modules/analytics/server/reports/activity";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Executives & teams" };

const loadParams = createLoader(reportSearchParams);

/** Executive report and manager/team report (M10-09). */
export default async function ExecutivesReportPage({
  searchParams,
}: PageProps<"/reports/executives">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const data = await executivesReport(ctx, resolved);
  const t = data.total;
  const n = (value: number) => value.toLocaleString("en-IN");
  const range = `from=${resolved.period.range.from}&to=${resolved.period.range.to}`;
  return (
    <ReportShell
      report="executives"
      title="Executives & teams"
      description="Activity and results per executive, or per manager's team."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
      extra={
        resolved.scope.scope !== "OWN" ? (
          <GroupSelect
            value={data.grouping}
            choices={[
              { value: "member", label: "Executive" },
              { value: "team", label: "Team" },
            ]}
            label="Per"
          />
        ) : null
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Calls" value={n(t.calls)} hint={`${t.connectRate ?? 0}% connected`} />
        <StatTile
          label="Follow-ups done"
          value={n(t.followUpsCompleted)}
          hint={`${t.followUpAdherence ?? "—"}% on time`}
        />
        <StatTile
          label="Site visits"
          value={n(t.visitsCompleted + t.revisitsCompleted)}
          hint={`${n(t.revisitsCompleted)} revisits`}
        />
        <StatTile
          label="Bookings / closed"
          value={`${n(t.bookings)} / ${n(t.closures)}`}
          hint={`${n(t.lost)} lost`}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent>
          <BarList
            title="Bookings and closures"
            segments={[
              { label: "Bookings", slot: 1 },
              { label: "Closed / won", slot: 2 },
            ]}
            items={data.rows
              .filter((row) => row.values.bookings + row.values.closures > 0)
              .map((row) => ({
                key: row.key,
                label: row.label,
                values: [row.values.bookings, row.values.closures],
              }))}
            empty="No bookings or closures in this period."
          />
        </CardContent>
      </Card>
      <ReportTable
        report={performanceTable(
          "Executives",
          data.grouping === "team" ? "Team" : "Executive",
          data.rows,
        )}
        hrefs={data.rows.map((row) =>
          data.grouping === "team"
            ? row.key === "none"
              ? null
              : `/reports/executives?manager=${row.key}&${range}`
            : `/leads?owner=${row.key}`,
        )}
      />
      <p className="text-xs text-muted-foreground">
        Activity counts for the member who did it; lost and not interested count for the lead&apos;s
        owner. Talk time is in minutes.
      </p>
    </ReportShell>
  );
}
