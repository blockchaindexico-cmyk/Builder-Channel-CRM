import { Download } from "lucide-react";
import type { Metadata } from "next";
import { createLoader, parseAsString } from "nuqs/server";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { ANALYTICS_PERMISSIONS } from "@/modules/analytics/permissions";
import { listMyExports } from "@/modules/analytics/server/exports";
import { getRegionalSettings } from "@/modules/organization";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "My exports" };

const loadParams = createLoader({ queued: parseAsString });

const STATUS = {
  QUEUED: { label: "Waiting", variant: "muted" },
  RUNNING: { label: "Preparing", variant: "info" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
} as const;

/** The member's report exports (M10-18): large ones are prepared in the background and downloaded here. */
export default async function ExportsPage({ searchParams }: PageProps<"/reports/exports">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, ANALYTICS_PERMISSIONS.reportsExport);
  const [{ queued }, exports, regional] = await Promise.all([
    loadParams(searchParams),
    listMyExports(ctx),
    getRegionalSettings(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="My exports"
        description="Report files you exported. Large ones are prepared in the background — you get a notification when they are ready."
        breadcrumbs={[{ label: "Reports", href: "/reports" }, { label: "My exports" }]}
      />
      {queued ? (
        <p className="mb-4 rounded-lg border border-info/40 bg-info/10 p-3 text-sm" role="status">
          Your export is being prepared. Refresh this page in a moment, or wait for the
          notification.
        </p>
      ) : null}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report</TableHead>
              <TableHead>Asked on</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead>
                <span className="sr-only">Download</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                  No exports yet. Use the Excel or CSV buttons on a report.
                </TableCell>
              </TableRow>
            ) : (
              exports.map((entry) => {
                const status = STATUS[entry.status as keyof typeof STATUS];
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.title}{" "}
                      <span className="text-xs text-muted-foreground uppercase">
                        {entry.format}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(entry.createdAt, regional)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {entry.error ? (
                        <span className="ml-2 text-xs text-destructive">{entry.error}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.rowCount?.toLocaleString("en-IN") ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.downloadable ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/api/reports/exports/${entry.id}`}>
                            <Download /> Download
                          </a>
                        </Button>
                      ) : entry.status === "READY" ? (
                        <span className="text-xs text-muted-foreground">
                          Downloaded when exported
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
