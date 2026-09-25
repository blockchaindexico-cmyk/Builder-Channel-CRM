import { BellOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MarkAllReadButton,
  NotificationList,
} from "@/modules/notifications/components/notification-list";
import { NOTIFICATION_CATEGORIES } from "@/modules/notifications/constants";
import { getNotificationSummary, listMyNotifications } from "@/modules/notifications/server/center";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Notifications" };

function hrefFor(params: { view?: string; category?: string | null; page?: number }) {
  const search = new URLSearchParams();
  if (params.view === "unread") search.set("view", "unread");
  if (params.category) search.set("category", params.category);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/notifications?${query}` : "/notifications";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

/** Notification center (M06-06): all or unread, by category, newest first. */
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const params = await searchParams;
  const ctx = await getRequestContext();
  const view = params.view === "unread" ? "unread" : "all";
  const category =
    typeof params.category === "string" &&
    (NOTIFICATION_CATEGORIES as readonly string[]).includes(params.category)
      ? params.category
      : null;
  const requestedPage = Number(params.page);
  const [list, summary] = await Promise.all([
    listMyNotifications(ctx, {
      unreadOnly: view === "unread",
      category,
      page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
      pageSize: 25,
    }),
    getNotificationSummary(ctx, 0),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What the CRM told you about, newest first. Choose what you get in My profile → Notifications."
        actions={<MarkAllReadButton category={category} disabled={summary.unread === 0} />}
      />
      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        role="navigation"
        aria-label="Filters"
      >
        <Chip href={hrefFor({ category })} active={view === "all"}>
          All
        </Chip>
        <Chip href={hrefFor({ view: "unread", category })} active={view === "unread"}>
          {`Unread (${summary.unread})`}
        </Chip>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Chip href={hrefFor({ view })} active={category === null}>
          Everything
        </Chip>
        {NOTIFICATION_CATEGORIES.map((entry) => (
          <Chip key={entry} href={hrefFor({ view, category: entry })} active={category === entry}>
            {entry}
          </Chip>
        ))}
      </div>
      {list.items.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={view === "unread" ? "No unread notifications" : "No notifications yet"}
          description={
            view === "unread"
              ? "You have read everything here."
              : "New leads, reminders and announcements for you will show up here."
          }
        />
      ) : (
        <NotificationList items={list.items} />
      )}
      {list.pageCount > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Page {list.page} of {list.pageCount} · {list.total} notifications
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={list.page <= 1}>
              {list.page > 1 ? (
                <Link href={hrefFor({ view, category, page: list.page - 1 })}>Previous</Link>
              ) : (
                <span aria-disabled>Previous</span>
              )}
            </Button>
            <Button asChild variant="outline" size="sm" disabled={list.page >= list.pageCount}>
              {list.page < list.pageCount ? (
                <Link href={hrefFor({ view, category, page: list.page + 1 })}>Next</Link>
              ) : (
                <span aria-disabled>Next</span>
              )}
            </Button>
          </div>
        </nav>
      ) : null}
    </>
  );
}
