"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

/** A toolbar filter: one choice or "all" (null). */
export function DataTableSelectFilter({
  label,
  value,
  onChange,
  choices,
  allLabel,
  className,
}: {
  /** Accessible name, e.g. "Filter by project". */
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  choices: { value: string; label: string }[];
  allLabel: string;
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger size="sm" className={cn("w-40", className)} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
