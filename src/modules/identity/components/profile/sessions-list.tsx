"use client";

import { LogOut, Monitor } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useFormatters } from "@/components/shared/regional-settings";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";
import { describeUserAgent } from "@/lib/user-agent";

import { revokeOtherSessionsAction, revokeSessionAction } from "../../actions";
import type { MySession } from "../../server/sessions";

/** Devices signed in to the account, with sign-out for the others (M02-16). */
export function SessionsList({ sessions }: { sessions: MySession[] }) {
  const router = useRouter();
  const format = useFormatters();
  const others = sessions.filter((session) => !session.current);

  async function revoke(sessionId: string) {
    const error = actionErrorMessage(await revokeSessionAction({ sessionId }));
    if (error) return void toast.error(error);
    toast.success("Device signed out");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center gap-3 px-4 py-3">
            <Monitor className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {describeUserAgent(session.userAgent)}
                {session.current ? <Badge variant="success">This device</Badge> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.ipAddress ?? "Unknown IP"} · signed in {format.date(session.createdAt)} ·
                active <RelativeTime value={session.lastActiveAt} />
              </p>
            </div>
            {!session.current ? (
              <Button variant="ghost" size="sm" onClick={() => void revoke(session.id)}>
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <LogOut /> Sign out all other devices
            </Button>
          }
          title="Sign out all other devices?"
          description={`${others.length} other session(s) will end immediately. This device stays signed in.`}
          confirmLabel="Sign out others"
          onConfirm={async () => {
            const result = await revokeOtherSessionsAction();
            const error = actionErrorMessage(result);
            if (error) {
              toast.error(error);
              return false;
            }
            toast.success(`Signed out ${result?.data?.ended ?? 0} device(s)`);
            router.refresh();
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">You are not signed in on any other device.</p>
      )}
    </div>
  );
}
