import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A figure with its label and the change vs the previous period (M10-02). The change is coloured by whether the
 * direction is good news, and always carries an arrow and a sign — never colour alone.
 */
export function StatTile({
  label,
  value,
  change,
  higherIsBetter = true,
  hint,
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Percent change vs the previous period; null when there was nothing before. */
  change?: number | null;
  higherIsBetter?: boolean | null;
  hint?: ReactNode;
  href?: string;
  className?: string;
}) {
  const good =
    change === undefined || change === null || change === 0 || higherIsBetter === null
      ? null
      : change > 0 === higherIsBetter;
  const Icon = !change ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {change !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium",
              good === true && "text-success",
              good === false && "text-destructive",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {change === null ? "new" : `${change > 0 ? "+" : ""}${change}%`}
            <span className="sr-only"> vs the previous period</span>
          </span>
        ) : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </>
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        "block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={cn("rounded-lg border bg-card p-4", className)}>{body}</div>
  );
}
