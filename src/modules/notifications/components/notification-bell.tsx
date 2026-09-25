"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { actionErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { markAllNotificationsReadAction, markNotificationsAction } from "../actions";
import { NOTIFICATIONS_CHANGED_EVENT } from "../constants";
import type { NotificationItem } from "../server/center";
import { NotificationRow } from "./notification-row";

const POLL_MS = 30_000;

export interface NotificationSummary {
  unread: number;
  recent: NotificationItem[];
}

/**
 * Bell in the top bar (M06-06): unread count, polled every 30 seconds while the tab is visible and whenever the
 * window regains focus; the dropdown lists the latest notifications and opens what they are about.
 */
export function NotificationBell({ initial }: { initial: NotificationSummary }) {
  const router = useRouter();
  const [summary, setSummary] = useState(initial);
  const [open, setOpen] = useState(false);
  // A server re-render (router.refresh after marking notifications elsewhere) brings a fresh summary.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setSummary(initial);
  }

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/summary", { cache: "no-store" });
      if (response.ok) setSummary((await response.json()) as NotificationSummary);
    } catch {
      // Offline or signed out: keep showing what we have.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onChange = () => void refresh();
    window.addEventListener("focus", onChange);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onChange);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChange);
    };
  }, [refresh]);

  function markLocally(ids: string[] | "all") {
    setSummary((current) => {
      const recent = current.recent.map((item) =>
        ids === "all" || ids.includes(item.id) ? { ...item, read: true } : item,
      );
      const newlyRead =
        ids === "all"
          ? current.unread
          : current.recent.filter((item) => ids.includes(item.id) && !item.read).length;
      return { unread: Math.max(0, current.unread - newlyRead), recent };
    });
  }

  async function openItem(item: NotificationItem) {
    if (!item.read) {
      markLocally([item.id]);
      await markNotificationsAction({ ids: [item.id], read: true });
    }
    setOpen(false);
    // Refresh keeps an open notification page in step with the bell.
    if (item.link) router.push(item.link);
    else router.refresh();
  }

  async function markAll() {
    markLocally("all");
    const result = await markAllNotificationsReadAction({});
    const error = actionErrorMessage(result);
    if (error) {
      toast.error(error);
      void refresh();
      return;
    }
    router.refresh();
  }

  const { unread, recent } = summary;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void refresh();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void markAll()}>
              <CheckCheck />
              Mark all read
            </Button>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        ) : (
          <ul aria-label="Latest notifications" className="max-h-[26rem] divide-y overflow-y-auto">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void openItem(item)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                    !item.read && "bg-primary/[0.03]",
                  )}
                >
                  <NotificationRow item={item} compact />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t p-1.5">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              See all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
