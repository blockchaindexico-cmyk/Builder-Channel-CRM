"use client";

import { Megaphone } from "lucide-react";
import { useEffect } from "react";

import { useFormatters } from "@/components/shared/regional-settings";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { markAnnouncementsReadAction } from "../actions";
import type { MyAnnouncement } from "../server/announcements";

/** Live announcements for the person, newest first; opening the page counts as reading them (M06-09). */
export function AnnouncementFeed({ announcements }: { announcements: MyAnnouncement[] }) {
  const format = useFormatters();
  const unreadIds = announcements.filter((item) => !item.read).map((item) => item.id);
  const unreadKey = unreadIds.join(",");

  useEffect(() => {
    if (unreadKey) void markAnnouncementsReadAction({ ids: unreadKey.split(",") });
  }, [unreadKey]);

  return (
    <div className="space-y-4">
      {announcements.map((item) => (
        <Card key={item.id} id={item.id}>
          <CardHeader className="gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Megaphone className="size-4 text-primary" aria-hidden />
              <CardTitle className="text-base">{item.title}</CardTitle>
              {!item.read ? <Badge>New</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {item.createdByName} · {format.dateTime(item.publishedAt)}
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{item.body}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
