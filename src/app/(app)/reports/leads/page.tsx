import type { Metadata } from "next";
import Link from "next/link";
import { createLoader } from "nuqs/server";

import { BarList } from "@/components/shared/charts/bar-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import { leadReportRows, leadsTable } from "@/modules/analytics/server/reports/leads";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Lead database" };

const loadParams = createLoader(reportSearchParams);
const PAGE_SIZE = 50;

/** Overall lead report (M10-10): the lead database with every filter, paged, exported in the background. */
export default async function LeadsReportPage({ searchParams }: PageProps<"/reports/leads">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const params = await loadParams(searchParams);
  const resolved = await resolveReportParams(ctx, params);
  const page = Math.max(1, params.page ?? 1);
  const data = await leadReportRows(ctx, resolved, {
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const pageHref = (target: number) => {
    const query = new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        value === null || key === "page" ? [] : [[key, String(value)]],
      ),
    );
    query.set("page", String(target));
    return `/reports/leads?${query.toString()}`;
  };
  return (
    <ReportShell
      report="leads"
      title="Lead database"
      description="Every lead created in the period, with its status, owner, source, projects and milestones."
      resolved={resolved}
      filters={["manager", "executive", "status", "builder", "project", "source"]}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {data.total.toLocaleString("en-IN")} leads by current status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarList
            title="Leads by status"
            items={data.byStatus.map((status) => ({
              key: status.label,
              label: status.label,
              values: [status.count],
            }))}
            empty="No leads created in this period."
          />
        </CardContent>
      </Card>
      <ReportTable
        report={leadsTable(data.rows)}
        hrefs={data.rows.map((row) => `/leads/${row.id}`)}
        empty="No leads created in this period."
      />
      <nav className="flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-muted-foreground">
          Page {page} of {pages}
        </span>
        <span className="flex gap-2">
          <Button variant="outline" size="sm" asChild disabled={page <= 1}>
            {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button variant="outline" size="sm" asChild disabled={page >= pages}>
            {page < pages ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </span>
      </nav>
    </ReportShell>
  );
}
