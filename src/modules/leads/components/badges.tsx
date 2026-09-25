import { Flame, Snowflake, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { TEMPERATURES } from "../constants";

/** Lead status with its configured colour (M04-03). */
export function LeadStatusBadge({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 border-transparent", className)}
      style={{ backgroundColor: `${color}1f`, color }}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </Badge>
  );
}

const ICONS = { HOT: Flame, WARM: Sun, COLD: Snowflake } as const;

export function TemperatureBadge({ value }: { value: string | null }) {
  if (!value) return null;
  const entry = TEMPERATURES.find((item) => item.value === value);
  const Icon = ICONS[value as keyof typeof ICONS];
  return (
    <Badge variant={entry?.tone ?? "muted"} className="gap-1">
      {Icon ? <Icon /> : null}
      {entry?.label ?? value}
    </Badge>
  );
}
