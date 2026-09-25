"use client";

import { TZDate } from "@date-fns/tz";
import { addDays, addHours, setHours, setMinutes, startOfDay } from "date-fns";

import { useRegionalSettings } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toZonedInputValue } from "@/lib/date-range";

/** Quick choices for "when", in the organization's time zone. */
function quickPicks(timezone: string, now: Date) {
  const local = new TZDate(now, timezone);
  const at = (day: Date, hour: number) => setMinutes(setHours(startOfDay(day), hour), 0);
  const inOneHour = new Date(Math.ceil(addHours(local, 1).getTime() / 900_000) * 900_000);
  const picks = [{ label: "In 1 hour", value: inOneHour }];
  if (local.getHours() < 17) picks.push({ label: "This evening", value: at(local, 18) });
  picks.push(
    { label: "Tomorrow 10 AM", value: at(addDays(local, 1), 10) },
    { label: "In 3 days", value: at(addDays(local, 3), 10) },
    { label: "Next week", value: at(addDays(local, 7), 10) },
  );
  return picks.map((pick) => ({
    label: pick.label,
    value: toZonedInputValue(pick.value, timezone),
  }));
}

/** Date and time input (organization time zone) with one-click choices. */
export function DuePicker({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const { timezone } = useRegionalSettings();
  return (
    <div className="space-y-2">
      <Input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
      />
      <div className="flex flex-wrap gap-1.5">
        {quickPicks(timezone, new Date()).map((pick) => (
          <Button
            key={pick.label}
            type="button"
            variant={value === pick.value ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onChange(pick.value)}
          >
            {pick.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
