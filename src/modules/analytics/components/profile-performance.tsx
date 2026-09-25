import { ColumnChart } from "@/components/shared/charts/column-chart";
import { StatTile } from "@/components/shared/charts/stat-tile";
import { presetRange } from "@/lib/date-range";
import { getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

import { METRICS } from "../metrics";
import { ANALYTICS_PERMISSIONS } from "../permissions";
import { getMetricSeries, getMetricSummary } from "../server/metrics";

/** Activity and performance summary on one's profile (M10-07): the last 30 days, compared with the 30 before. */
export async function ProfilePerformance() {
  const ctx = await getRequestContext();
  if (!ctx.permissions.has(ANALYTICS_PERMISSIONS.reportsView) || !ctx.actor.membershipId) {
    return <p className="text-sm text-muted-foreground">Your role does not include reports.</p>;
  }
  const regional = await getRegionalSettings(ctx);
  const range = presetRange("last_30_days", { timezone: regional.timezone });
  const filters = { range, executiveId: ctx.actor.membershipId };
  const [summary, series] = await Promise.all([
    getMetricSummary(ctx, filters),
    getMetricSeries(ctx, filters, "week"),
  ]);
  const values = summary.current;
  const tiles = [
    ["calls", values.calls, `${values.connectRate ?? 0}% connected`],
    [
      "followUpsCompleted",
      values.followUpsCompleted,
      `${values.followUpAdherence ?? "—"}% on time`,
    ],
    [
      "visitsCompleted",
      values.visitsCompleted + values.revisitsCompleted,
      `${values.revisitsCompleted} revisits`,
    ],
    ["bookings", values.bookings, undefined],
    ["closures", values.closures, undefined],
    ["lost", values.lost, `${values.notInterested} not interested`],
  ] as const;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Your last 30 days, compared with the 30 days before.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([key, value, hint]) => (
          <StatTile
            key={key}
            label={METRICS[key].label}
            value={value.toLocaleString("en-IN")}
            change={summary.change[key]}
            higherIsBetter={METRICS[key].higherIsBetter}
            hint={hint}
          />
        ))}
      </div>
      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm font-medium">Calls per week</p>
        <ColumnChart
          title="Calls per week"
          data={series.map((point) => ({
            key: point.key,
            label: point.label,
            values: { calls: point.values.calls },
          }))}
          series={[{ key: "calls", label: "Calls", slot: 1 }]}
        />
      </div>
    </div>
  );
}
