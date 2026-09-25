import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import { isIsoDate } from "@/lib/date-range";
import type { RegionalSettings } from "@/modules/organization";

import { fiscalYearOf } from "../fiscal";
import type { Period } from "./reports";

/** Today in the organization's time zone and the period asked for, else the current fiscal year. */
export function resolvePeriod(
  regional: Pick<RegionalSettings, "timezone" | "fiscalYearStartMonth">,
  params: { from?: string | null; to?: string | null },
): { today: string; period: Period; fiscalYear: string } {
  const today = format(new TZDate(new Date(), regional.timezone), "yyyy-MM-dd");
  const year = fiscalYearOf(today, regional.fiscalYearStartMonth);
  const period =
    isIsoDate(params.from) && isIsoDate(params.to) && params.from <= params.to
      ? { from: params.from, to: params.to }
      : { from: year.start, to: year.end };
  return { today, period, fiscalYear: year.label };
}
