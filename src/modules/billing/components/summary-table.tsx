import type { ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface SummaryColumn<Row> {
  key: string;
  header: string;
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
}

/** A compact report table with an optional totals row (server-rendered). */
export function SummaryTable<Row extends { key: string }>({
  caption,
  columns,
  rows,
  total,
  empty = "Nothing in this period.",
}: {
  caption: string;
  columns: SummaryColumn<Row>[];
  rows: Row[];
  total?: Row;
  empty?: string;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(column.numeric && "text-right whitespace-nowrap")}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-6 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(column.numeric && "text-right whitespace-nowrap tabular-nums")}
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
        {total && rows.length > 0 ? (
          <TableFooter>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "font-semibold",
                    column.numeric && "text-right whitespace-nowrap tabular-nums",
                  )}
                >
                  {column.cell(total)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}

/** A figure with its label, for the top of report pages. */
export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "attention" | "positive" | "negative";
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "attention" && "text-warning-foreground dark:text-warning",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
