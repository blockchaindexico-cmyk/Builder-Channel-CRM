import { ChevronRight, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import type { ReportCatalogEntry } from "@/modules/analytics";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { appRegistry } from "@/modules/registry";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Reports" };

const GROUPS: ReportCatalogEntry["group"][] = [
  "Performance",
  "Leads",
  "Activities",
  "Deals",
  "Finance",
];

/** The reports hub (M10-08): every report the viewer may open, contributed by the modules. */
export default async function ReportsPage() {
  const ctx = await getRequestContext();
  const entries = [...appRegistry.contributions("report.catalog")]
    .filter((entry) => !entry.permission || ctx.permissions.has(entry.permission))
    .sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Work and results for any period, filtered by team, builder, project and source — with exports."
        actions={
          ctx.permissions.has(ANALYTICS_PERMISSIONS.reportsExport) ? (
            <Button variant="outline" asChild>
              <Link href="/reports/exports">
                <Download /> My exports
              </Link>
            </Button>
          ) : null
        }
      />
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your role does not include any report.</p>
      ) : (
        <div className="space-y-8">
          {GROUPS.map((group) => {
            const items = entries.filter((entry) => entry.group === group);
            if (!items.length) return null;
            return (
              <section key={group} aria-labelledby={`group-${group}`}>
                <h2
                  id={`group-${group}`}
                  className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {group}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((entry) => (
                    <li key={entry.key}>
                      <Link
                        href={entry.href}
                        className="flex h-full items-start justify-between gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
                      >
                        <span>
                          <span className="block font-medium">{entry.title}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {entry.description}
                          </span>
                        </span>
                        <ChevronRight
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
