"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Free-text chips (tags, preferred locations): Enter or comma adds, Backspace on empty input removes. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  max = 20,
  maxLength = 40,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const text = raw.trim().replace(/,+$/, "").trim();
    if (!text || value.includes(text) || value.length >= max) return;
    onChange([...value, text.slice(0, maxLength)]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
      setDraft("");
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        className,
      )}
    >
      {value.map((item) => (
        <Badge key={item} variant="secondary" className="gap-1 pr-1">
          {item}
          <button
            type="button"
            className="rounded-sm hover:bg-foreground/10"
            aria-label={`Remove ${item}`}
            onClick={() => onChange(value.filter((entry) => entry !== item))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Input
        id={id}
        value={draft}
        aria-label={ariaLabel}
        placeholder={value.length ? undefined : placeholder}
        className="h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          add(draft);
          setDraft("");
        }}
      />
    </div>
  );
}
