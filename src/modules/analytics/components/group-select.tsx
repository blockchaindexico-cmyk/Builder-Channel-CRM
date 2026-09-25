"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** "Group by" of a report (the `group` URL parameter). */
export function GroupSelect({
  value,
  choices,
  label = "Group by",
}: {
  value: string;
  choices: readonly { value: string; label: string }[];
  label?: string;
}) {
  const [, startTransition] = useTransition();
  const [, setGroup] = useQueryState(
    "group",
    parseAsString.withOptions({ shallow: false, startTransition }),
  );
  return (
    <Select value={value} onValueChange={(next) => void setGroup(next)}>
      <SelectTrigger size="sm" className="w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {label} {choice.label.toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
