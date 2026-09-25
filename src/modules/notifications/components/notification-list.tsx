"use client";

import { CheckCheck, Mail, MailOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { actionErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { markAllNotificationsReadAction, markNotificationsAction } from "../actions";
import { NOTIFICATIONS_CHANGED_EVENT } from "../constants";
import type { NotificationItem } from "../server/center";
import { NotificationRow } from "./notification-row";

/** Tells the bell in the top bar to fetch its count again. */
function announceChange() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

/** The full notification list (M06-06): open, mark read or unread one by one. */
export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function mark(item: NotificationItem, read: boolean) {
    setPending(item.id);
    const result = await markNotificationsAction({ ids: [item.id], read });
    setPending(null);
    const error = actionErrorMessage(result);
    if (error) return void toast.error(error);
    announceChange();
    router.refresh();
  }

  async function open(item: NotificationItem) {
    if (!item.read) {
      await markNotificationsAction({ ids: [item.id], read: true });
      announceChange();
    }
    if (item.link) router.push(item.link);
    else router.refresh();
  }

  return (
    <ul aria-label="Notifications" className="divide-y rounded-lg border bg-card">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn("flex items-start gap-2 px-3 py-1", !item.read && "bg-primary/[0.03]")}
        >
          <button
            type="button"
            onClick={() => void open(item)}
            className="min-w-0 flex-1 rounded-md px-1 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <NotificationRow item={item} />
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="mt-2 size-8 shrink-0"
            disabled={pending === item.id}
            onClick={() => void mark(item, !item.read)}
            aria-label={`${item.read ? "Mark as unread" : "Mark as read"}: ${item.title}`}
            title={item.read ? "Mark as unread" : "Mark as read"}
          >
            {item.read ? <Mail /> : <MailOpen />}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function MarkAllReadButton({
  category,
  disabled,
}: {
  category: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        const result = await markAllNotificationsReadAction({ category });
        setBusy(false);
        const error = actionErrorMessage(result);
        if (error) return void toast.error(error);
        toast.success("All caught up");
        announceChange();
        router.refresh();
      }}
    >
      <CheckCheck />
      Mark all read
    </Button>
  );
}
