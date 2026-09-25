"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";

import { saveNotificationSettingsAction } from "../../actions";
import { NOTIFICATION_CATEGORIES } from "../../constants";
import type { NotificationSettings } from "../../schemas";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelValue,
  type NotificationTypeDefinition,
} from "../../types";

interface TypeState {
  enabled: boolean;
  channels: NotificationChannelValue[];
}

const sameChannels = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

/** Organization notification settings (M06-08): which types are sent and how, reminders, daily summary. */
export function NotificationSettingsForm({
  types,
  settings,
  timezone,
}: {
  types: NotificationTypeDefinition[];
  settings: NotificationSettings;
  timezone: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, TypeState>>(() =>
    Object.fromEntries(
      types.map((type) => [
        type.key,
        {
          enabled: type.critical ? true : (settings.types[type.key]?.enabled ?? true),
          channels: settings.types[type.key]?.channels ?? type.defaultChannels,
        },
      ]),
    ),
  );
  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled);
  const [busy, setBusy] = useState(false);

  const missingChannel = types.filter(
    (type) => state[type.key]!.enabled && state[type.key]!.channels.length === 0,
  );

  function update(key: string, change: Partial<TypeState>) {
    setState((current) => ({ ...current, [key]: { ...current[key]!, ...change } }));
  }

  // Text fields are read from the form on submit, so what was typed before the page finished loading counts.
  async function save(form: FormData) {
    const minutes = Number(form.get("reminderLeadMinutes"));
    const digestTime = String(form.get("digestTime") ?? "");
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
      return void toast.error("Reminder time must be between 0 and 1440 minutes.");
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(digestTime)) {
      return void toast.error("Enter the daily summary time, e.g. 08:30.");
    }
    const overrides: NotificationSettings["types"] = {};
    for (const type of types) {
      const value = state[type.key]!;
      if (value.enabled && sameChannels(value.channels, type.defaultChannels)) continue;
      overrides[type.key] = value;
    }
    setBusy(true);
    const result = await saveNotificationSettingsAction({
      types: overrides,
      reminderLeadMinutes: minutes,
      digestEnabled,
      digestTime,
    });
    setBusy(false);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Notification settings saved");
    router.refresh();
  }

  return (
    <form
      className="max-w-4xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save(new FormData(event.currentTarget));
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>What is sent</CardTitle>
          <CardDescription>
            Turn notifications on or off for everyone and choose how people get them unless they
            change it in their profile. Essential ones cannot be turned off.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Notification
                </th>
                <th scope="col" className="w-20 px-2 py-2 text-center font-medium">
                  Sent
                </th>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <th
                    key={channel.value}
                    scope="col"
                    className="w-28 px-2 py-2 text-center font-medium"
                  >
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map((category) => {
                const inCategory = types.filter((type) => type.category === category);
                if (inCategory.length === 0) return null;
                return (
                  <Fragment key={category}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={4}
                        className="pt-5 pb-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                      >
                        {category}
                      </th>
                    </tr>
                    {inCategory.map((type) => {
                      const value = state[type.key]!;
                      return (
                        <tr key={type.key} className="border-b last:border-0">
                          <td className="py-3 pr-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{type.label}</span>
                              {type.critical ? <Badge variant="secondary">Essential</Badge> : null}
                            </div>
                            <p className="text-muted-foreground">{type.description}</p>
                            {value.enabled && value.channels.length === 0 ? (
                              <p className="text-destructive">
                                Choose at least one way, or turn it off.
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-3 text-center">
                            <Switch
                              checked={value.enabled}
                              disabled={type.critical}
                              onCheckedChange={(enabled) => update(type.key, { enabled })}
                              aria-label={`Send “${type.label}”`}
                            />
                          </td>
                          {NOTIFICATION_CHANNELS.map((channel) => (
                            <td key={channel.value} className="px-2 py-3 text-center">
                              <Checkbox
                                checked={value.channels.includes(channel.value)}
                                disabled={!value.enabled}
                                onCheckedChange={(checked) =>
                                  update(type.key, {
                                    channels:
                                      checked === true
                                        ? [...new Set([...value.channels, channel.value])]
                                        : value.channels.filter((entry) => entry !== channel.value),
                                  })
                                }
                                aria-label={`“${type.label}” ${
                                  channel.value === "EMAIL" ? "by e-mail" : "in the app"
                                } by default`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders and daily summary</CardTitle>
          <CardDescription>
            Times are in the organization&apos;s time zone ({timezone}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="reminder-lead">Remind people this many minutes before</Label>
            <Input
              id="reminder-lead"
              name="reminderLeadMinutes"
              type="number"
              min={0}
              max={1440}
              required
              defaultValue={settings.reminderLeadMinutes}
            />
            <p className="text-sm text-muted-foreground">
              Default for follow-ups, callbacks and site visits (0 = at the time itself).
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Switch
              id="digest-enabled"
              checked={digestEnabled}
              onCheckedChange={setDigestEnabled}
            />
            <div className="grid gap-1">
              <Label htmlFor="digest-enabled">Send a daily summary to managers and admins</Label>
              <p className="text-sm text-muted-foreground">
                Open, untouched, unworked and unassigned leads of their team or the organization.
              </p>
            </div>
          </div>
          <div className="grid max-w-xs gap-2">
            <Label htmlFor="digest-time">Daily summary time</Label>
            <Input
              id="digest-time"
              name="digestTime"
              type="time"
              required
              defaultValue={settings.digestTime}
            />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={busy || missingChannel.length > 0}>
        {busy ? "Saving…" : "Save notification settings"}
      </Button>
    </form>
  );
}
