import Link from "next/link";

import { StatTile } from "@/components/shared/charts/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { DashboardWidgetProps } from "@/modules/analytics";
import { getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

import { BILLING_PERMISSIONS } from "../permissions";
import { resolvePeriod } from "../server/period";
import { getBillingDashboard, getProfitAndLoss } from "../server/reports";

/** Finance cards on the dashboard (M10-06), for people with finance or billing access. */
export async function FinanceWidget({ range }: DashboardWidgetProps) {
  const ctx = await getRequestContext();
  const canFinance = ctx.permissions.has(BILLING_PERMISSIONS.financeView);
  const canBilling = ctx.permissions.has(BILLING_PERMISSIONS.billingView);
  if (!canFinance && !canBilling) return null;
  const regional = await getRegionalSettings(ctx);
  const { today } = resolvePeriod(regional, {});
  const [pl, billing] = await Promise.all([
    canFinance ? getProfitAndLoss(ctx, range, "builder") : Promise.resolve(null),
    canBilling ? getBillingDashboard(ctx, range, today) : Promise.resolve(null),
  ]);
  const money = (value: string) => formatMoney(value, regional, { compact: true });
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">Finance</CardTitle>
          <CardDescription>
            Commission earned on deals closed in the period, billing and collections.
          </CardDescription>
        </div>
        <Link
          href={canFinance ? "/reports/profit-loss" : "/billing"}
          className="text-sm text-primary hover:underline"
        >
          Details
        </Link>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {pl ? (
          <>
            <StatTile
              label="Gross commission"
              value={money(pl.total.grossCommission)}
              hint={`${pl.total.deals} deals`}
            />
            <StatTile
              label="Net profit on deals"
              value={money(pl.total.netProfit)}
              hint={pl.total.margin ? `${pl.total.margin}% margin` : undefined}
            />
          </>
        ) : null}
        {billing ? (
          <>
            <StatTile
              label="Collected"
              value={money(billing.collected)}
              hint={`${money(billing.billed)} billed`}
              href="/billing/payments"
            />
            <StatTile
              label="Outstanding"
              value={money(billing.outstanding)}
              hint={`${money(billing.overdue)} overdue`}
              href="/billing/invoices?status=OPEN"
            />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
