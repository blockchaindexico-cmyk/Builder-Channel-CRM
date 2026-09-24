"use client";

import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DATE_RANGE_PRESETS,
  type DateRange,
  type DateRangePreset,
  formatDateRangeLabel,
  presetRange,
} from "@/lib/date-range";
import { cn } from "@/lib/utils";

import { useRegionalSettings } from "./regional-settings";

const ISO_DATE = "yyyy-MM-dd";

/**
 * Date range selector with Today / week / month presets and a custom two-month calendar (M01-22).
 * Values are calendar dates in the organization's timezone.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = "Any date",
  className,
  allowClear = true,
}: {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
}) {
  const settings = useRegionalSettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerRange | undefined>(undefined);

  const selected: DayPickerRange | undefined = value
    ? { from: parse(value.from, ISO_DATE, new Date()), to: parse(value.to, ISO_DATE, new Date()) }
    : undefined;

  const applyPreset = (preset: DateRangePreset) => {
    onChange(presetRange(preset, { timezone: settings.timezone }));
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(selected);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon />
          {value ? formatDateRangeLabel(value, settings.dateFormat) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row flex-wrap gap-1 border-b p-2 sm:flex-col sm:border-r sm:border-b-0">
            {DATE_RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => applyPreset(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
            {allowClear && value ? (
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-muted-foreground"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={draft?.from ?? selected?.from}
              selected={draft}
              onSelect={setDraft}
              weekStartsOn={1}
            />
            <div className="flex justify-end gap-2 border-t p-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft?.from}
                onClick={() => {
                  if (!draft?.from) return;
                  onChange({
                    from: format(draft.from, ISO_DATE),
                    to: format(draft.to ?? draft.from, ISO_DATE),
                  });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
