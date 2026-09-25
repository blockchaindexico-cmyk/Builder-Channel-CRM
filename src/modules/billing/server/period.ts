import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { isIsoDate } from "@/lib/date-range";
import type { ServiceContext } from "@/platform/tenant/context";

import { fiscalYearOf } from "../fiscal";
import type { Period } from "./reports";
import { getBillingSettings } from "./settings";

/** Today in the organization's time zone and the period asked for, else the current fiscal year. */
export async function resolvePeriod(
  ctx: ServiceContext,
  timezone: string,
  params: { from?: string | null; to?: string | null },
): Promise<{ today: string; period: Period; fiscalYear: string }> {
  const today = format(new TZDate(new Date(), timezone), "yyyy-MM-dd");
  const { fiscalYearStartMonth } = await getBillingSettings(ctx.db, ctx);
  const year = fiscalYearOf(today, fiscalYearStartMonth);
  const period =
    isIsoDate(params.from) && isIsoDate(params.to) && params.from <= params.to
      ? { from: params.from, to: params.to }
      : { from: year.start, to: year.end };
  return { today, period, fiscalYear: year.label };
}
