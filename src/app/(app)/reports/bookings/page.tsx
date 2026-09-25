import type { Metadata } from "next";
import { createLoader } from "nuqs/server";

import { BarList } from "@/components/shared/charts/bar-list";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { GroupSelect } from "@/modules/analytics/components/group-select";
import { ReportShell } from "@/modules/analytics/components/report-shell";
import { ReportTable } from "@/modules/analytics/components/report-table";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { reportSearchParams } from "@/modules/analytics/search-params";
import { resolveReportParams } from "@/modules/analytics/server/report-params";
import {
  BOOKING_GROUPS,
  bookingsReport,
  bookingsTable,
} from "@/modules/analytics/server/reports/deals";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Bookings report" };

const loadParams = createLoader(reportSearchParams);

/** Booking report and closed business report (M10-14). */
export default async function BookingsReportPage({ searchParams }: PageProps<"/reports/bookings">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsView);
  const resolved = await resolveReportParams(ctx, await loadParams(searchParams));
  const [data, regional] = await Promise.all([
    bookingsReport(ctx, resolved),
    getRegionalSettings(ctx),
  ]);
  const n = (value: number) => value.toLocaleString("en-IN");
  const money = (value: string | null) =>
    value === null ? null : formatMoney(value, regional, { compact: true });
  const { from, to } = resolved.period.range;
  const drill = (key: string) => {
    if (data.group === "month") return null;
    const param = {
      builder: "builder",
      project: "project",
      manager: "manager",
      executive: "executive",
    }[data.group];
    return key === "none" ? null : `/bookings?${param}=${key}&from=${from}&to=${to}`;
  };
  return (
    <ReportShell
      report="bookings"
      title="Bookings & closed business"
      description="Bookings by booking date, closures and cancellations by the day they happened."
      resolved={resolved}
      filters={["manager", "executive", "builder", "project", "source"]}
      extra={<GroupSelect value={data.group} choices={BOOKING_GROUPS} />}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Bookings"
          value={n(data.total.bookings)}
          hint={money(data.total.bookedValue) ?? undefined}
        />
        <StatTile
          label="Closed / won"
          value={n(data.total.closures)}
          hint={money(data.total.closedValue) ?? undefined}
        />
        <StatTile label="Cancelled" value={n(data.total.cancellations)} />
        <StatTile
          label="Closed per booking"
          value={
            data.total.bookings
              ? `${Math.round((data.total.closures / data.total.bookings) * 100)}%`
              : "—"
          }
          hint="closures ÷ bookings of the period"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            By {BOOKING_GROUPS.find((entry) => entry.value === data.group)!.label.toLowerCase()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarList
            title="Bookings and closures"
            segments={[
              { label: "Bookings", slot: 1 },
              { label: "Closed / won", slot: 2 },
            ]}
            items={data.rows.slice(0, 20).map((row) => ({
              key: row.key,
              label: row.label,
              values: [row.bookings, row.closures],
              display: `${n(row.bookings)} booked · ${n(row.closures)} closed${row.closedValue !== null ? ` · ${money(row.closedValue)}` : ""}`,
            }))}
            empty="No bookings in this period."
          />
        </CardContent>
      </Card>
      <ReportTable
        report={bookingsTable(data)}
        hrefs={[...data.rows.map((row) => drill(row.key)), null]}
        totalRow
      />
      {!data.values ? (
        <p className="text-xs text-muted-foreground">
          Booking values are visible to authorized people only.
        </p>
      ) : null}
    </ReportShell>
  );
}
