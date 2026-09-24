import type { VariantProps } from "class-variance-authority";

import { Badge, type badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/**
 * Coloured status label (M01-22). Pass a `tone`, or a `color` (hex from configurable masters such as lead
 * statuses) to render a dot in that colour.
 */
export function StatusBadge({
  label,
  tone = "muted",
  color,
  className,
}: {
  label: string;
  tone?: StatusTone;
  color?: string | null;
  className?: string;
}) {
  return (
    <Badge variant={color ? "outline" : tone} className={cn("gap-1.5", className)}>
      {color ? (
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
      ) : null}
      {label}
    </Badge>
  );
}
