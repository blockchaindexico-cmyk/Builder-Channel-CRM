"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";

import { saveActivitySettingsAction } from "../../actions";
import type { ActivitySettings } from "../../schemas";

/** Missed and unresponsive rules, transfer on reassignment, status automation (M07-03). */
export function ActivityOptionsForm({
  settings,
  reminderLeadMinutes,
}: {
  settings: ActivitySettings;
  reminderLeadMinutes: number;
}) {
  const router = useRouter();
  const [transfer, setTransfer] = useState(settings.transferOnReassign);
  const [autoApply, setAutoApply] = useState(settings.autoApplyStatus);
  const [busy, setBusy] = useState(false);

  // Number fields are read on submit, so values typed while the page loads are kept.
  async function save(form: FormData) {
    const missedGraceMinutes = Number(form.get("missedGraceMinutes"));
    const unresponsiveAfterAttempts = Number(form.get("unresponsiveAfterAttempts"));
    setBusy(true);
    const result = await saveActivitySettingsAction({
      missedGraceMinutes,
      unresponsiveAfterAttempts,
      transferOnReassign: transfer,
      autoApplyStatus: autoApply,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Call and follow-up options saved");
    router.refresh();
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Options</CardTitle>
        <CardDescription>
          Reminders go out {reminderLeadMinutes} minutes before a follow-up —{" "}
          <Link
            href="/settings/notifications"
            className="text-primary underline-offset-4 hover:underline"
          >
            change in Notifications
          </Link>
          .
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
            <Label htmlFor="missed-grace">A follow-up counts as missed after (minutes)</Label>
            <Input
              id="missed-grace"
              name="missedGraceMinutes"
              type="number"
              min={0}
              max={10080}
              required
              defaultValue={settings.missedGraceMinutes}
            />
            <p className="text-sm text-muted-foreground">
              Counted from its time. The owner is told; it stays open until done, moved or
              cancelled.
            </p>
          </div>
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="unresponsive-after">
              Suggest “Unresponsive” after unanswered calls in a row
            </Label>
            <Input
              id="unresponsive-after"
              name="unresponsiveAfterAttempts"
              type="number"
              min={1}
              max={20}
              required
              defaultValue={settings.unresponsiveAfterAttempts}
            />
          </div>
          <div className="flex items-start gap-3">
            <Switch id="transfer" checked={transfer} onCheckedChange={setTransfer} />
            <div className="grid gap-1">
              <Label htmlFor="transfer">Open follow-ups move with a reassigned lead</Label>
              <p className="text-sm text-muted-foreground">
                The new owner gets them and their reminders; when off they stay with the previous
                owner.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Switch id="auto-apply" checked={autoApply} onCheckedChange={setAutoApply} />
            <div className="grid gap-1">
              <Label htmlFor="auto-apply">
                Apply suggested statuses to calls reported by a phone system
              </Label>
              <p className="text-sm text-muted-foreground">
                Calls logged by a person always show the suggestion so they can confirm or change
                it.
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
