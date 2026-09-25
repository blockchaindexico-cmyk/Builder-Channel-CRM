"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";

import { saveDealSettingsAction } from "../../actions";
import type { DealSettings } from "../../schemas";

/** Visit reminder time, what moves with a reassigned lead, when a missing outcome is flagged (M08-02). */
export function DealOptionsForm({ settings }: { settings: DealSettings }) {
  const router = useRouter();
  const [transfer, setTransfer] = useState(settings.transferVisitsOnReassign);
  const [busy, setBusy] = useState(false);

  // Number fields are read on submit, so values typed while the page loads are kept.
  async function save(form: FormData) {
    setBusy(true);
    const result = await saveDealSettingsAction({
      visitReminderMinutes: Number(form.get("visitReminderMinutes")),
      outcomeDueHours: Number(form.get("outcomeDueHours")),
      transferVisitsOnReassign: transfer,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Visit and booking options saved");
    router.refresh();
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Options</CardTitle>
        <CardDescription>
          Booking values are shown only to roles with “See booking values”.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save(new FormData(event.currentTarget));
          }}
        >
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="visit-reminder">Remind the executive before a visit (minutes)</Label>
            <Input
              id="visit-reminder"
              name="visitReminderMinutes"
              type="number"
              min={0}
              max={2880}
              required
              defaultValue={settings.visitReminderMinutes}
            />
            <p className="text-sm text-muted-foreground">
              Time enough to arrange a pickup; 0 reminds at the visit time.
            </p>
          </div>
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="outcome-due">Ask for the outcome after (hours)</Label>
            <Input
              id="outcome-due"
              name="outcomeDueHours"
              type="number"
              min={1}
              max={168}
              required
              defaultValue={settings.outcomeDueHours}
            />
            <p className="text-sm text-muted-foreground">
              A visit with nothing recorded this long after its time reminds its executive and shows
              in the manager&apos;s alerts.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Switch id="transfer-visits" checked={transfer} onCheckedChange={setTransfer} />
            <div className="grid gap-1">
              <Label htmlFor="transfer-visits">Upcoming visits move with a reassigned lead</Label>
              <p className="text-sm text-muted-foreground">
                Visits that already happened stay with whoever went; bookings keep their credited
                executive.
              </p>
            </div>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save options"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
