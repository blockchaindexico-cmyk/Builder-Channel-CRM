"use client";

import {
  AlarmClock,
  Bell,
  Copy,
  FileUp,
  Megaphone,
  Newspaper,
  UserRound,
  UsersRound,
} from "lucide-react";

import { RelativeTime } from "@/components/shared/relative-time";
import { cn } from "@/lib/utils";

import type { NotificationItem } from "../server/center";

function NotificationIcon({ type }: { type: string }) {
  const className = "size-4";
  if (type === "announcement") return <Megaphone className={className} />;
  if (type === "reminder") return <AlarmClock className={className} />;
  if (type === "import.finished") return <FileUp className={className} />;
  if (type === "digest.daily") return <Newspaper className={className} />;
  if (type === "lead.duplicate") return <Copy className={className} />;
  if (type.startsWith("team.")) return <UsersRound className={className} />;
  if (type.startsWith("lead.")) return <UserRound className={className} />;
  return <Bell className={className} />;
}

/** One notification: icon, title, text, who and when; unread ones are bold with a dot. */
export function NotificationRow({
  item,
  compact = false,
}: {
  item: NotificationItem;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          item.priority === "HIGH" && !item.read
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <NotificationIcon type={item.type} />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn("text-sm", item.read ? "text-foreground/80" : "font-semibold")}>
          {item.title}
        </p>
        {item.body ? (
          <p
            className={cn(
              "text-sm whitespace-pre-line text-muted-foreground",
              compact && "line-clamp-2",
            )}
          >
            {item.body}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          <RelativeTime value={item.createdAt} />
          {item.actorName ? ` · ${item.actorName}` : null}
        </p>
      </div>
      {!item.read ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
      ) : null}
    </div>
  );
}
