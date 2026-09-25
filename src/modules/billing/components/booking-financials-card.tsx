import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

import { getDealForBooking } from "../server/financials";
import { DealStatusBadge } from "./badges";

/** Deal financials on the booking page (M09-06), for people who may see them. */
export async function BookingFinancialsCard({ bookingId }: { bookingId: string }) {
  const ctx = await getRequestContext();
  const deal = await getDealForBooking(ctx, bookingId);
  if (!deal) return null;
  const regional = await getRegionalSettings(ctx);
  const money = (value: string) => formatMoney(value, regional);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          Deal financials <DealStatusBadge status={deal.status} />
        </CardTitle>
        <Link href={`/billing/deals/${deal.id}`} className="text-sm text-primary hover:underline">
          Open
        </Link>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Commission</dt>
            <dd className="font-medium tabular-nums">{money(deal.grossCommission)}</dd>
            <dd className="text-xs text-muted-foreground">{deal.commissionBasis}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Net revenue</dt>
            <dd className="font-medium tabular-nums">{money(deal.netRevenue)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Net profit</dt>
            <dd className="font-medium tabular-nums">{money(deal.netProfit)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Invoice</dt>
            <dd>
              {deal.invoice ? (
                <Link
                  href={`/billing/invoices/${deal.invoice.id}`}
                  className="text-primary hover:underline"
                >
                  {deal.invoice.number ?? "Draft"}
                </Link>
              ) : (
                <span className="text-muted-foreground">Not billed yet</span>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
