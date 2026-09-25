import type { ReactNode } from "react";

/** The table view every chart carries (identity and values never depend on colour alone). */
export function ChartTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
        Show as table
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={header}
                  className={
                    index ? "px-2 py-1.5 text-right font-medium" : "px-2 py-1.5 font-medium"
                  }
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={index ? "px-2 py-1 text-right tabular-nums" : "px-2 py-1"}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul
      className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-label="Legend"
    >
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-[3px]"
            style={{ background: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
