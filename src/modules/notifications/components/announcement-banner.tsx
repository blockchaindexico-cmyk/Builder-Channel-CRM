"use client";

import { Megaphone, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { markAnnouncementsReadAction } from "../actions";
import type { MyAnnouncement } from "../server/announcements";

const MAX_SHOWN = 2;

/** Live announcements the person has not dismissed yet, above every page (M06-09). */
export function AnnouncementBanner({ announcements }: { announcements: MyAnnouncement[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = announcements.filter((item) => !dismissed.includes(item.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((current) => [...current, id]);
    void markAnnouncementsReadAction({ ids: [id] });
  }

  return (
    <div className="mb-6 space-y-2">
      {visible.slice(0, MAX_SHOWN).map((item) => (
        <section
          key={item.id}
          aria-label={`Announcement: ${item.title}`}
          className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
        >
          <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">
              {item.body}
            </p>
            <Link
              href="/announcements"
              className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {visible.length > MAX_SHOWN
                ? `Read all ${visible.length} announcements`
                : "Read more"}
            </Link>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={`Dismiss “${item.title}”`}
            onClick={() => dismiss(item.id)}
          >
            <X />
          </Button>
        </section>
      ))}
    </div>
  );
}
