import { getRegionalSettings } from "@/modules/organization";
import type { ServiceContext } from "@/platform/tenant/context";

import { type ReportFilters, type ReportScope, resolveReportScope } from "./metrics";
import { type ResolvedPeriod, resolvePeriodParams } from "./params";

/** URL parameters shared by every report page and its export (M10-08). */
export interface ReportParams {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  by?: string | null;
  executive?: string | null;
  manager?: string | null;
  builder?: string | null;
  project?: string | null;
  source?: string | null;
  status?: string | null;
  group?: string | null;
  page?: number | string | null;
}

export const REPORT_PARAM_KEYS = [
  "period",
  "from",
  "to",
  "by",
  "executive",
  "manager",
  "builder",
  "project",
  "source",
  "status",
  "group",
] as const;

export interface ResolvedReport {
  period: ResolvedPeriod;
  filters: ReportFilters;
  scope: ReportScope;
  group: string | null;
}

/** Period (this month by default), filters and the viewer's scope for a report. */
export async function resolveReportParams(
  ctx: ServiceContext,
  params: ReportParams,
): Promise<ResolvedReport> {
  const regional = await getRegionalSettings(ctx);
  const period = resolvePeriodParams(regional, params, "this_month");
  const filters: ReportFilters = {
    range: period.range,
    executiveId: params.executive,
    managerId: params.manager,
    builderId: params.builder,
    projectId: params.project,
    sourceId: params.source,
    statusId: params.status,
  };
  const scope = await resolveReportScope(ctx, filters);
  return { period, filters, scope, group: params.group ?? null };
}
