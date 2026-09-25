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

import { saveAssignmentSettingsAction } from "../../actions";
import type { AssignmentSettings } from "../../schemas";

/** Creator assignment (M05-06) and the "unworked" threshold (M05-08, Q-08). */
export function AssignmentOptionsForm({ settings }: { settings: AssignmentSettings }) {
  const router = useRouter();
  const [assignCreator, setAssignCreator] = useState(settings.assignCreator);
  const [hours, setHours] = useState(String(settings.unworkedHours));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const result = await saveAssignmentSettingsAction({
      assignCreator,
      unworkedHours: Number(hours),
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Assignment options saved");
    router.refresh();
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Options</CardTitle>
        <CardDescription>
          How new leads get their first owner and when a lead counts as unworked.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex items-start gap-3">
            <Switch
              id="assign-creator"
              checked={assignCreator}
              onCheckedChange={setAssignCreator}
            />
            <div className="grid gap-1">
              <Label htmlFor="assign-creator">Executives own the leads they create</Label>
              <p className="text-sm text-muted-foreground">
                When off, their new leads go through the assignment rules or wait in the unassigned
                queue — and executives cannot see them until they are assigned back.
              </p>
            </div>
          </div>
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="unworked-hours">A lead is unworked after (hours)</Label>
            <Input
              id="unworked-hours"
              type="number"
              min={1}
              max={720}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Counted from its assignment, as long as nothing was logged on it. Shown on the team
              workload board and used to flag the unassigned queue.
            </p>
          </div>
          <Button type="submit" disabled={busy || !(Number(hours) >= 1 && Number(hours) <= 720)}>
            {busy ? "Saving…" : "Save options"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
