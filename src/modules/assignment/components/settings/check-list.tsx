"use client";

import { Checkbox } from "@/components/ui/checkbox";

/** A compact multi-select: a scrollable list of checkboxes. `ordered` keeps the order of choosing. */
export function CheckList({
  label,
  options,
  value,
  onChange,
  emptyLabel = "Nothing to choose from.",
}: {
  label: string;
  options: { id: string; label: string; hint?: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  emptyLabel?: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border p-1.5">
          {options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1 text-sm hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={value.includes(option.id)}
                  aria-label={`${label}: ${option.label}`}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...value, option.id]
                        : value.filter((entry) => entry !== option.id),
                    )
                  }
                />
                {option.label}
              </span>
              {option.hint ? (
                <span className="text-xs text-muted-foreground">{option.hint}</span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
