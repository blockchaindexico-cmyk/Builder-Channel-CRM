"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { actionErrorMessage } from "@/lib/action-result";

import { resetPreferencesAction, setPreferenceAction } from "../../actions";
import { NOTIFICATION_CATEGORIES } from "../../constants";
import type { PreferenceRow } from "../../server/preferences";
import { NOTIFICATION_CHANNELS, type NotificationChannelValue } from "../../types";

/** Type × channel switches; essential types keep their last channel switched on. */
export function PreferencesTable({ rows: initial }: { rows: PreferenceRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(row: PreferenceRow, channel: NotificationChannelValue, enabled: boolean) {
    const key = `${row.key}:${channel}`;
    setBusy(key);
    const before = rows;
    setRows((current) =>
      current.map((entry) =>
        entry.key === row.key
          ? {
              ...entry,
              customized: true,
              channels: enabled
                ? [...new Set([...entry.channels, channel])]
                : entry.channels.filter((value) => value !== channel),
            }
          : entry,
      ),
    );
    const result = await setPreferenceAction({ type: row.key, channel, enabled });
    setBusy(null);
    const error = actionErrorMessage(result);
    if (error) {
      setRows(before);
      toast.error(error);
      return;
    }
    toast.success(`${row.label}: ${enabled ? "on" : "off"} ${channelLabel(channel)}`);
  }

  async function reset() {
    setBusy("reset");
    const result = await resetPreferencesAction();
    setBusy(null);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    toast.success("Back to your organization's defaults");
    router.refresh();
  }

  const channelLabel = (channel: NotificationChannelValue) =>
    channel === "EMAIL" ? "by e-mail" : "in the app";

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">
                Notification
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
              const inCategory = rows.filter((row) => row.category === category);
              if (inCategory.length === 0) return null;
              return (
                <Fragment key={category}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={3}
                      className="pt-5 pb-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      {category}
                    </th>
                  </tr>
                  {inCategory.map((row) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.label}</span>
                          {row.critical ? <Badge variant="secondary">Essential</Badge> : null}
                          {row.disabledByOrganization ? (
                            <Badge variant="outline">Turned off by your organization</Badge>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground">{row.description}</p>
                      </td>
                      {NOTIFICATION_CHANNELS.map((channel) => {
                        const on = row.channels.includes(channel.value);
                        const lastOn = row.critical && on && row.channels.length === 1;
                        return (
                          <td key={channel.value} className="px-2 py-3 text-center">
                            <Switch
                              checked={on}
                              disabled={row.disabledByOrganization || lastOn || busy !== null}
                              onCheckedChange={(checked) =>
                                void toggle(row, channel.value, checked)
                              }
                              aria-label={`${row.label} ${channelLabel(channel.value)}`}
                              title={
                                lastOn ? "Essential: keep at least one way to get it" : undefined
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some((row) => row.customized) ? (
        <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void reset()}>
          Reset to defaults
        </Button>
      ) : null}
    </div>
  );
}
