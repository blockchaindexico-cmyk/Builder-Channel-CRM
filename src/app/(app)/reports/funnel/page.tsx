import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { Funnel } from "@/components/shared/charts/funnel";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GroupSelect } from "@/modules/analytics/components/group-select";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import { getFunnel, getSourcePerformance } from "@/modules/analytics/server/insights";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import { funnelTable } from "@/modules/analytics/server/reports/leads";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Funnel & sources" };

const loadParams = createLoader(reportSearchParams);

/** Funnel / conversion report and source / campaign performance (M10-16). */
export default async function FunnelReportPage({ searchParams }: PageProps<"/reports/funnel">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const byCampaign = resolved.group === "campaign";
  const [funnel, sources] = await Promise.all([
    getFunnel(ctx, resolved.filters, resolved.scope),
    getSourcePerformance(ctx, resolved.filters, { byCampaign }, resolved.scope),
  ]);
  const days = (value: number | null) => (value === null ? "—" : `${value} d`);
  const table = funnelTable(funnel, sources);
  if (!byCampaign) {
    table.columns = table.columns.filter((column) => column.header !== "Campaign");
    table.rows = table.rows.map((row) => [row[0]!, ...row.slice(2)]);
  }
  return (
    <ReportShell
      report="funnel"
      title="Funnel & sources"
      description="Leads created in the period, how far they have come and how long each stage took."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
      extra={
        <GroupSelect
          value={byCampaign ? "campaign" : "source"}
          choices={[
            { value: "source", label: "Source" },
            { value: "campaign", label: "Campaign" },
          ]}
          label="Per"
        />
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stage-to-stage conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel
              title="Lead funnel"
              steps={[
                { key: "created", label: "Leads", value: funnel.created },
                { key: "contacted", label: "Contacted", value: funnel.contacted },
                { key: "visited", label: "Visited", value: funnel.visited },
                { key: "booked", label: "Booked", value: funnel.booked },
                { key: "won", label: "Closed / won", value: funnel.won },
              ]}
            />
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Days to first contact" value={days(funnel.daysToContact)} />
          <StatTile label="Days to first visit" value={days(funnel.daysToVisit)} />
          <StatTile label="Days to booking" value={days(funnel.daysToBooking)} />
          <StatTile label="Days to closure" value={days(funnel.daysToWin)} />
          <StatTile
            label="Lost so far"
            value={funnel.lost.toLocaleString("en-IN")}
            className="col-span-2"
          />
        </div>
      </div>
      <ReportTable
        report={table}
        hrefs={[
          ...sources.map((row) =>
            row.sourceId
              ? `/leads?source=${row.sourceId}${row.campaignId ? `&campaign=${row.campaignId}` : ""}`
              : null,
          ),
          null,
        ]}
        totalRow
        empty="No leads created in this period."
      />
      <p className="text-xs text-muted-foreground">
        Averages count days from the lead&apos;s creation, for the leads that reached the stage.
      </p>
    </ReportShell>
  );
}
