"use client";

import { useEffect, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadStatusFieldsProps } from "@/modules/leads";

import { lossReasonOptionsAction } from "../actions";

type Scope = "LOST" | "NOT_INTERESTED";

const cache = new Map<Scope, Promise<{ id: string; label: string }[]>>();

function loadReasons(scope: Scope) {
  let pending = cache.get(scope);
  if (!pending) {
    pending = lossReasonOptionsAction({ scope }).then((result) => result?.data ?? []);
    cache.set(scope, pending);
    // Reasons change rarely; a later dialog in another minute reloads them.
    setTimeout(() => cache.delete(scope), 60_000);
  }
  return pending;
}

/**
 * The loss reason asked for whenever a lead is closed as Lost or Not Interested (M08-11), in the status dialog, a
 * bulk change and the call dialog (`lead.status.fields`). The server refuses the change without one.
 */
export function LossReasonFields({ target, details, onChange, disabled }: LeadStatusFieldsProps) {
  const scope: Scope | null =
    target.category === "LOST"
      ? target.key === "NOT_INTERESTED"
        ? "NOT_INTERESTED"
        : "LOST"
      : null;
  const [reasons, setReasons] = useState<{ id: string; label: string }[] | null>(null);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    void loadReasons(scope).then((list) => {
      if (active) setReasons(list);
    });
    return () => {
      active = false;
    };
  }, [scope]);

  if (!scope) return null;
  const value = typeof details.lossReasonId === "string" ? details.lossReasonId : "";
  return (
    <div className="grid gap-2">
      <Label htmlFor="loss-reason">
        Loss reason <span className="text-destructive">(required)</span>
      </Label>
      <Select
        value={value}
        onValueChange={(lossReasonId) => onChange({ ...details, lossReasonId })}
        disabled={disabled || !reasons}
      >
        <SelectTrigger id="loss-reason" className="w-full" aria-label="Loss reason">
          <SelectValue placeholder={reasons ? "Why is the lead closed?" : "Loading…"} />
        </SelectTrigger>
        <SelectContent>
          {(reasons ?? []).map((reason) => (
            <SelectItem key={reason.id} value={reason.id}>
              {reason.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
