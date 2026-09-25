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
  const [busy, setBusy] = useState(false);

  // The hours field is read on submit, so a value typed before the page finished loading is not lost.
  async function save(form: FormData) {
    const unworkedHours = Number(form.get("unworkedHours"));
    if (!Number.isInteger(unworkedHours) || unworkedHours < 1 || unworkedHours > 720) {
      return void toast.error("Enter a number of hours between 1 and 720.");
    }
    setBusy(true);
    const result = await saveAssignmentSettingsAction({ assignCreator, unworkedHours });
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
            void save(new FormData(event.currentTarget));
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
              name="unworkedHours"
              type="number"
              min={1}
              max={720}
              required
              defaultValue={settings.unworkedHours}
            />
            <p className="text-sm text-muted-foreground">
              Counted from its assignment, as long as nothing was logged on it. Shown on the team
              workload board and used to flag the unassigned queue.
            </p>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save options"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
