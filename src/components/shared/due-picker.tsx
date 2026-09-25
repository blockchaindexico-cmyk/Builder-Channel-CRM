"use client";

import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addHours,
  nextSaturday,
  nextSunday,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";

import { useRegionalSettings } from "@/components/shared/regional-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toZonedInputValue } from "@/lib/date-range";

/** A one-click choice: a label and the moment it stands for. */
export interface QuickPick {
  label: string;
  value: Date;
}

/** Builds the quick choices from "now" in the organization's time zone (a zoned date). */
export type QuickPicks = (local: TZDate) => QuickPick[];

const at = (day: Date, hour: number) => setMinutes(setHours(startOfDay(day), hour), 0);

/** For follow-ups and callbacks: soon, this evening, tomorrow, in a few days. */
export const followUpPicks: QuickPicks = (local) => {
  const inOneHour = new Date(Math.ceil(addHours(local, 1).getTime() / 900_000) * 900_000);
  const picks: QuickPick[] = [{ label: "In 1 hour", value: inOneHour }];
  if (local.getHours() < 17) picks.push({ label: "This evening", value: at(local, 18) });
  picks.push(
    { label: "Tomorrow 10 AM", value: at(addDays(local, 1), 10) },
    { label: "In 3 days", value: at(addDays(local, 3), 10) },
    { label: "Next week", value: at(addDays(local, 7), 10) },
  );
  return picks;
};

/** For site visits, which happen mostly at weekends. */
export const visitPicks: QuickPicks = (local) => {
  const saturday = nextSaturday(local);
  return [
    { label: "Tomorrow 11 AM", value: at(addDays(local, 1), 11) },
    { label: "Saturday 11 AM", value: at(saturday, 11) },
    { label: "Sunday 11 AM", value: at(nextSunday(local), 11) },
    { label: "Next Saturday", value: at(addDays(saturday, 7), 11) },
  ];
};

/** Date and time input (organization time zone) with one-click choices. */
export function DuePicker({
  id,
  value,
  onChange,
  invalid,
  picks = followUpPicks,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  picks?: QuickPicks;
}) {
  const { timezone } = useRegionalSettings();
  const choices = picks(new TZDate(new Date(), timezone)).map((pick) => ({
    label: pick.label,
    value: toZonedInputValue(pick.value, timezone),
  }));
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
        {choices.map((pick) => (
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
