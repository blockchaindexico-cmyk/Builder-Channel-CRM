import type { DateRangePreset } from "@/lib/date-range";
import { listBuilderOptions, listProjectOptions } from "@/modules/catalog";
import { listMemberOptions } from "@/modules/identity";
import { getRegionalSettings } from "@/modules/organization";
import type { ServiceContext } from "@/platform/tenant/context";

import { ANALYTICS_PERMISSIONS } from "../permissions";
import {
  type AgendaToday,
  type FunnelCounts,
  getAgendaToday,
  getFunnel,
  getProjectPerformance,
  getSourcePerformance,
  type ProjectPerformance,
  type SourcePerformance,
} from "./insights";
import {
  getMemberMetrics,
  getMetricSeries,
  getMetricSummary,
  getPipeline,
  type MemberMetrics,
  type MetricSummary,
  type PipelineSnapshot,
  type ReportFilters,
  type ReportScope,
  resolveReportScope,
  type SeriesPoint,
} from "./metrics";
import { type ResolvedPeriod, resolvePeriodParams } from "./params";

/**
 * Everything a dashboard shows (M10-04 → M10-06), loaded in parallel. The view follows the viewer's scope for
 * `reports.view`: their own day, their team, or the organization.
 */
export interface DashboardParams {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  by?: string | null;
  executive?: string | null;
  builder?: string | null;
  project?: string | null;
  source?: string | null;
}

export interface DashboardData {
  view: "OWN" | "TEAM" | "ALL";
  period: ResolvedPeriod;
  filters: ReportFilters;
  scope: ReportScope;
  summary: MetricSummary;
  series: SeriesPoint[];
  pipeline: PipelineSnapshot;
  agenda: AgendaToday | null;
  members: MemberMetrics[];
  funnel: FunnelCounts | null;
  sources: SourcePerformance[];
  projects: ProjectPerformance[];
  options: {
    executives: { value: string; label: string }[];
    builders: { value: string; label: string }[];
    projects: { value: string; label: string }[];
    sources: { value: string; label: string }[];
    managers: { value: string; label: string }[];
    statuses: { value: string; label: string }[];
  };
}

/** Null when the viewer has no `reports.view` (the dashboard then shows only a welcome). */
export async function loadDashboard(
  ctx: ServiceContext,
  params: DashboardParams,
): Promise<DashboardData | null> {
  if (!ctx.permissions.has(ANALYTICS_PERMISSIONS.reportsView)) return null;
  const base = await resolveReportScope(ctx);
  const view = base.scope;
  const regional = await getRegionalSettings(ctx);
  // Executives start on today, managers and admins on this month.
  const fallback: DateRangePreset = view === "OWN" ? "today" : "this_month";
  const period = resolvePeriodParams(regional, params, fallback);
  const filters: ReportFilters = {
    range: period.range,
    executiveId: view === "OWN" ? null : params.executive,
    builderId: params.builder,
    projectId: params.project,
    sourceId: params.source,
  };
  const scope = filters.executiveId ? await resolveReportScope(ctx, filters) : base;
  // A single day reads better as the last two weeks by day.
  const seriesFilters =
    period.range.from === period.range.to
      ? {
          ...filters,
          range: {
            from: new Date(Date.parse(`${period.range.to}T00:00:00Z`) - 13 * 86_400_000)
              .toISOString()
              .slice(0, 10),
            to: period.range.to,
          },
        }
      : filters;
  const [summary, series, pipeline, agenda, members, funnel, sources, projects, options] =
    await Promise.all([
      getMetricSummary(ctx, filters, scope),
      getMetricSeries(
        ctx,
        seriesFilters,
        period.range.from === period.range.to ? "day" : period.granularity,
        scope,
      ),
      getPipeline(ctx, filters, scope),
      view === "OWN" || period.range.to >= scope.today
        ? getAgendaToday(ctx, scope)
        : Promise.resolve(null),
      view === "OWN" ? Promise.resolve([]) : getMemberMetrics(ctx, filters, scope),
      getFunnel(ctx, filters, scope),
      view === "ALL" ? getSourcePerformance(ctx, filters, {}, scope) : Promise.resolve([]),
      view === "OWN" ? Promise.resolve([]) : getProjectPerformance(ctx, filters, scope),
      loadOptions(ctx, view, base),
    ]);
  return {
    view,
    period,
    filters,
    scope,
    summary,
    series,
    pipeline,
    agenda,
    members,
    funnel,
    sources,
    projects,
    options,
  };
}

export async function loadOptions(
  ctx: ServiceContext,
  view: DashboardData["view"],
  scope: ReportScope,
) {
  const [members, managers, builders, projects, sources, statuses] = await Promise.all([
    view === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, scope.memberIds ? { ids: scope.memberIds } : {}),
    view === "OWN"
      ? Promise.resolve([])
      : listMemberOptions(ctx, {
          managersOnly: true,
          ...(scope.memberIds ? { ids: scope.memberIds } : {}),
        }),
    listBuilderOptions(ctx, { includeInactive: true }).catch(() => []),
    listProjectOptions(ctx),
    ctx.db.leadSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ctx.db.leadStatus.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true },
    }),
  ]);
  return {
    executives: members.map((member) => ({ value: member.membershipId, label: member.name })),
    builders: builders.map((builder) => ({ value: builder.id, label: builder.name })),
    projects: projects.map((project) => ({
      value: project.id,
      label: `${project.name} · ${project.builderName}`,
    })),
    sources: sources.map((source) => ({ value: source.id, label: source.name })),
    managers: managers.map((member) => ({ value: member.membershipId, label: member.name })),
    statuses: statuses.map((status) => ({ value: status.id, label: status.label })),
  };
}
