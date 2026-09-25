import {
  DATE_RANGE_PRESETS,
  type DateRange,
  type DateRangePreset,
  isIsoDate,
  presetRange,
} from "@/lib/date-range";
import type { RegionalSettings } from "@/modules/organization";

import { defaultGranularity, GRANULARITIES, type Granularity } from "../period";

/**
 * Period chosen on a dashboard or report: a preset (today, this week, this month…) or custom dates, in the
 * organization's calendar (M10-02).
 */
export interface ResolvedPeriod {
  preset: DateRangePreset | "custom";
  range: DateRange;
  granularity: Granularity;
}

export function resolvePeriodParams(
  regional: Pick<RegionalSettings, "timezone" | "weekStartsOn">,
  params: { period?: string | null; from?: string | null; to?: string | null; by?: string | null },
  fallback: DateRangePreset,
): ResolvedPeriod {
  const weekStartsOn = (regional.weekStartsOn === 0 ? 0 : 1) as 0 | 1;
  let preset: ResolvedPeriod["preset"] = fallback;
  let range: DateRange;
  if (isIsoDate(params.from) && isIsoDate(params.to) && params.from <= params.to) {
    preset = "custom";
    range = { from: params.from, to: params.to };
  } else {
    const chosen = DATE_RANGE_PRESETS.find((entry) => entry.value === params.period)?.value;
    preset = chosen ?? fallback;
    range = presetRange(preset, { timezone: regional.timezone, weekStartsOn });
  }
  const granularity =
    GRANULARITIES.find((entry) => entry.value === params.by)?.value ?? defaultGranularity(range);
  return { preset, range, granularity };
}
