"use client";

import { Download, ListChecks } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actionErrorMessage } from "@/lib/action-result";

import { importFileUrlAction } from "../../actions";
import type { ImportBatchDetail } from "../../server/import/service";
import { ImportStatusBadge } from "./import-status-badge";

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

/** Progress and result of one import (M04-18); refreshes itself while the job runs. */
export function ImportProgress({ batch }: { batch: ImportBatchDetail }) {
  const router = useRouter();
  const running = batch.status === "QUEUED" || batch.status === "PROCESSING";
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [running, router]);

  const percent = batch.totalRows ? Math.round((batch.processedRows / batch.totalRows) * 100) : 0;
  const general = batch.problems.filter((problem) => problem.row === 0);
  const rows = batch.problems.filter((problem) => problem.row > 0);

  async function download(which: "original" | "errors") {
    setDownloading(which);
    const result = await importFileUrlAction({ batchId: batch.id, which });
    setDownloading(null);
    const error = actionErrorMessage(result);
    if (error || !result?.data) return void toast.error(error ?? "Download failed");
    window.location.assign(result.data.url);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {batch.fileName} <ImportStatusBadge status={batch.status} />
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {batch.totalRows} rows · started by {batch.createdByName}
              {batch.options.skipDuplicates ? " · existing customers skipped" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {batch.importedRows > 0 ? (
              <Button asChild variant="outline">
                <Link href={`/leads?import=${batch.id}`}>
                  <ListChecks /> View imported leads
                </Link>
              </Button>
            ) : null}
            {batch.hasErrorFile ? (
              <Button
                variant="outline"
                disabled={downloading !== null}
                onClick={() => void download("errors")}
              >
                <Download /> Rows not imported (CSV)
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={downloading !== null}
              onClick={() => void download("original")}
            >
              <Download /> Original file
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>
                {running
                  ? batch.status === "QUEUED"
                    ? "Waiting to start…"
                    : `Importing row ${batch.processedRows + 1} of ${batch.totalRows}…`
                  : batch.status === "FAILED"
                    ? "The import stopped."
                    : "Import finished."}
              </span>
              <span className="text-muted-foreground tabular-nums">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Imported" value={batch.importedRows} tone="text-success" />
            <Stat label="Flagged as possible duplicates" value={batch.duplicateRows} />
            <Stat label="Skipped" value={batch.skippedRows} />
            <Stat
              label="With errors"
              value={batch.errorRows}
              tone={batch.errorRows ? "text-destructive" : undefined}
            />
          </div>
          {general.map((problem) => (
            <p
              key={problem.message}
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              {problem.message}
            </p>
          ))}
        </CardContent>
      </Card>

      {rows.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Rows not imported</CardTitle>
            <p className="text-sm text-muted-foreground">
              Download them as a CSV (with the reason in the first columns), fix them and import
              that file again.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Row</TableHead>
                    <TableHead className="w-28">Outcome</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((problem) => (
                    <TableRow key={problem.row}>
                      <TableCell className="tabular-nums">{problem.row}</TableCell>
                      <TableCell>
                        {problem.skipped ? (
                          <Badge variant="muted">Skipped</Badge>
                        ) : (
                          <Badge variant="destructive">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-normal">{problem.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > 200 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Showing the first 200 of {batch.errorRows + batch.skippedRows} rows — the CSV has
                all of them.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
