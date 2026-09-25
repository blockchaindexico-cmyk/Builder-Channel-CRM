"use client";

import { cn } from "@/lib/utils";

/** A radio group shown as chips: quick to scan and click, keyboard-accessible (arrow keys). */
export function ChoiceChips<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
  className,
}: {
  name: string;
  legend: string;
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: string; tone?: "positive" | "negative" | "neutral" }[];
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-1.5", className)}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="relative cursor-pointer">
            {/* The real radio covers its chip (transparent), so it is what gets clicked and focused. */}
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer absolute inset-0 z-10 cursor-pointer appearance-none rounded-full opacity-0"
            />
            <span
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-muted",
                "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
                option.tone === "positive" && "border-success/40",
                option.tone === "negative" && "border-destructive/30",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
