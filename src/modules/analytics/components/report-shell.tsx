import "../server/report-definitions";

import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { getRequestContext } from "@/platform/tenant/request-context";

import { ANALYTICS_PERMISSIONS } from "../permissions";
import { getReportDefinition } from "../server/catalog";
import { loadOptions } from "../server/dashboard";
import { type ResolvedReport } from "../server/report-params";
import { listSavedReportViews } from "../server/saved-views";
import { type FilterKey, PeriodFilters } from "./period-filters";
import { ReportToolbar } from "./report-toolbar";

/**
 * The frame of every report page (M10-08): title, the one filter row (period, bucket size, people and dimensions),
 * saved views and exports.
 */
export async function ReportShell({
  report,
  title,
  description,
  resolved,
  filters,
  granularity = false,
  extra,
  children,
}: {
  report: string;
  title: string;
  description: string;
  resolved: ResolvedReport;
  filters: FilterKey[];
  granularity?: boolean;
  /** Controls of this report (e.g. group by), placed in the filter row. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const ctx = await getRequestContext();
  const [options, views] = await Promise.all([
    loadOptions(ctx, resolved.scope.scope, resolved.scope),
    listSavedReportViews(ctx, report),
  ]);
  const choices: Record<FilterKey, { label: string; choices: { value: string; label: string }[] }> =
    {
      executive: { label: "Executive", choices: options.executives },
      manager: { label: "Team", choices: options.managers },
      builder: { label: "Builder", choices: options.builders },
      project: { label: "Project", choices: options.projects },
      source: { label: "Source", choices: options.sources },
      status: { label: "Status", choices: options.statuses },
    };
  const definition = getReportDefinition(report);
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: title }]}
        actions={
          <ReportToolbar
            report={report}
            views={views}
            canExport={ctx.permissions.has(ANALYTICS_PERMISSIONS.reportsExport)}
            exportable={Boolean(definition?.table)}
            large={definition?.large}
          />
        }
      />
      <PeriodFilters
        preset={resolved.period.preset}
        range={resolved.period.range}
        granularity={granularity ? resolved.period.granularity : undefined}
        filters={Object.fromEntries(filters.map((key) => [key, choices[key]]))}
      >
        {extra}
      </PeriodFilters>
      <div className="space-y-6">{children}</div>
    </>
  );
}
