import { Megaphone } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { AnnouncementFeed } from "@/modules/notifications/components/announcement-feed";
import { listMyAnnouncements } from "@/modules/notifications/server/announcements";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Announcements" };

/** News published by the organization's administrators for the signed-in person (M06-09). */
export default async function AnnouncementsPage() {
  const ctx = await getRequestContext();
  const announcements = await listMyAnnouncements(ctx);
  return (
    <>
      <PageHeader title="Announcements" description="News from your organization." />
      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements"
          description="When your administrators publish news for you, it appears here."
        />
      ) : (
        <AnnouncementFeed announcements={announcements} />
      )}
    </>
  );
}
