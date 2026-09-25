import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader, parseAsString } from "nuqs/server";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DashboardView } from "@/modules/analytics/components/dashboard-view";
import { PeriodFilters } from "@/modules/analytics/components/period-filters";
import { loadDashboard } from "@/modules/analytics/server/dashboard";
import { uiRegistry } from "@/modules/registry.ui";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Dashboard" };

const loadParams = createLoader({
  period: parseAsString,
  from: parseAsString,
  to: parseAsString,
  by: parseAsString,
  executive: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  source: parseAsString,
});

const TITLES = {
  OWN: { title: "My day", description: "Your work and results for the period." },
  TEAM: { title: "Team dashboard", description: "Your team's work, pipeline and results." },
  ALL: { title: "Dashboard", description: "The organization at a glance." },
} as const;

/** Role-adaptive dashboard (M10-04 → M10-06): My Day, team or organization, by the viewer's report scope. */
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await getRequestContext();
  const params = await loadParams(searchParams);
  const data = await loadDashboard(ctx, params);
  if (!data) {
    const organization = await ctx.db.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    return (
      <>
        <PageHeader title="Dashboard" description={`Welcome to ${organization.name}.`} />
        <EmptyState
          icon={LayoutDashboard}
          title="No figures to show"
          description="Your role does not include reports. Your agenda has what is planned for you today."
          action={
            <Button asChild variant="outline">
              <Link href="/agenda">Open my agenda</Link>
            </Button>
          }
        />
      </>
    );
  }
  const widgets = await Promise.all(
    uiRegistry
      .extensions("dashboard.widget")
      .filter((widget) => !widget.permission || ctx.permissions.has(widget.permission))
      .filter((widget) => !widget.scopes || widget.scopes.includes(data.view))
      .toSorted((a, b) => a.order - b.order)
      .map(async (widget) => ({
        key: widget.key,
        wide: widget.wide,
        content: await widget.render({ range: data.period.range, scope: data.view }),
      })),
  );
  const { title, description } = TITLES[data.view];
  return (
    <>
      <PageHeader title={title} description={description} />
      <PeriodFilters
        preset={data.period.preset}
        range={data.period.range}
        presets={["today", "yesterday", "this_week", "this_month", "last_30_days"]}
        granularity={
          data.period.range.from === data.period.range.to ? undefined : data.period.granularity
        }
        filters={
          data.view === "OWN"
            ? { project: { label: "Project", choices: data.options.projects } }
            : {
                executive: { label: "Member", choices: data.options.executives },
                builder: { label: "Builder", choices: data.options.builders },
                project: { label: "Project", choices: data.options.projects },
                source: { label: "Source", choices: data.options.sources },
              }
        }
      />
      <DashboardView
        data={data}
        widgets={
          widgets.some((widget) => widget.content) ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {widgets.map((widget) =>
                widget.content ? (
                  <div key={widget.key} className={cn(widget.wide && "xl:col-span-2")}>
                    {widget.content}
                  </div>
                ) : null,
              )}
            </div>
          ) : null
        }
      />
    </>
  );
}
