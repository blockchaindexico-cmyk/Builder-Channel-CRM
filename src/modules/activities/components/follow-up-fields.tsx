"use client";

import { DuePicker } from "@/components/shared/due-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NONE = "__none__";

export interface FollowUpDraft {
  type: "FOLLOW_UP" | "CALLBACK";
  due: string;
  purposeId: string;
  notes: string;
}

export const emptyFollowUp = (type: FollowUpDraft["type"] = "FOLLOW_UP"): FollowUpDraft => ({
  type,
  due: "",
  purposeId: "",
  notes: "",
});

/** When, why and notes of a follow-up or callback (shared by the schedule, call and done dialogs). */
export function FollowUpFields({
  idPrefix,
  value,
  onChange,
  purposes,
  errors = {},
}: {
  idPrefix: string;
  value: FollowUpDraft;
  onChange: (value: FollowUpDraft) => void;
  purposes: { id: string; label: string }[];
  errors?: Record<string, string | undefined>;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-due`}>
          {value.type === "CALLBACK" ? "Call back at" : "When"}
        </Label>
        <DuePicker
          id={`${idPrefix}-due`}
          value={value.due}
          onChange={(due) => onChange({ ...value, due })}
          invalid={Boolean(errors.dueAt)}
        />
        {errors.dueAt ? <p className="text-sm text-destructive">{errors.dueAt}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-purpose`}>Purpose</Label>
        <Select
          value={value.purposeId || NONE}
          onValueChange={(purposeId) =>
            onChange({ ...value, purposeId: purposeId === NONE ? "" : purposeId })
          }
        >
          <SelectTrigger id={`${idPrefix}-purpose`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No particular purpose</SelectItem>
            {purposes.map((purpose) => (
              <SelectItem key={purpose.id} value={purpose.id}>
                {purpose.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-notes`}>Notes for then</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          maxLength={1000}
          value={value.notes}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </div>
    </div>
  );
}
