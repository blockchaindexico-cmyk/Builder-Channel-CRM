import { FileUp } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ImportBatchRow } from "../../server/import/service";
import { ImportStatusBadge } from "./import-status-badge";

/** Import history (M04-18): every file imported into the organization, newest first. */
export function ImportHistory({ batches }: { batches: ImportBatchRow[] }) {
  if (batches.length === 0) {
    return (
      <EmptyState
        icon={FileUp}
        title="No imports yet"
        description="Import leads from a CSV or Excel file exported from a portal, a campaign or another CRM."
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Imported</TableHead>
            <TableHead className="text-right">Possible duplicates</TableHead>
            <TableHead className="text-right">Skipped</TableHead>
            <TableHead className="text-right">Errors</TableHead>
            <TableHead>Started</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell className="max-w-72">
                <Link
                  href={`/leads/import/${batch.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {batch.fileName}
                </Link>
              </TableCell>
              <TableCell>
                <ImportStatusBadge status={batch.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{batch.totalRows}</TableCell>
              <TableCell className="text-right tabular-nums">{batch.importedRows}</TableCell>
              <TableCell className="text-right tabular-nums">{batch.duplicateRows}</TableCell>
              <TableCell className="text-right tabular-nums">{batch.skippedRows}</TableCell>
              <TableCell className="text-right tabular-nums">{batch.errorRows}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {batch.createdByName} · <RelativeTime value={batch.createdAt} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
