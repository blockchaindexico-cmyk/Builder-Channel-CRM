import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { TabularReport } from "../server/catalog";

/**
 * A report as a table (M10-08) — the very rows its CSV/XLSX export contains. The first cell of a row can link to
 * the records behind it (drill-down).
 */
export function ReportTable({
  report,
  hrefs,
  totalRow = false,
  empty = "Nothing in this period.",
}: {
  report: TabularReport;
  /** Drill-down link per row (first column). */
  hrefs?: (string | null)[];
  /** Style the last row as totals. */
  totalRow?: boolean;
  empty?: string;
}) {
  const format = (value: unknown, header: string) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") {
      const text = value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
      return header.endsWith("%") ? `${text}%` : text;
    }
    return String(value);
  };
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <caption className="sr-only">{report.title}</caption>
        <TableHeader>
          <TableRow>
            {report.columns.map((column) => (
              <TableHead
                key={column.header}
                scope="col"
                className={cn(column.numeric && "text-right whitespace-nowrap")}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={report.columns.length}
                className="py-6 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            report.rows.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={cn(
                  totalRow && rowIndex === report.rows.length - 1 && "bg-muted/50 font-semibold",
                )}
              >
                {row.map((cell, index) => {
                  const column = report.columns[index]!;
                  const text = format(cell, column.header);
                  const href = index === 0 ? hrefs?.[rowIndex] : null;
                  return (
                    <TableCell
                      key={index}
                      className={cn(
                        column.numeric
                          ? "text-right whitespace-nowrap tabular-nums"
                          : "max-w-72 truncate",
                        index === 0 && "font-medium",
                      )}
                      title={typeof cell === "string" && cell.length > 40 ? cell : undefined}
                    >
                      {href ? (
                        <Link href={href} className="text-primary hover:underline">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
