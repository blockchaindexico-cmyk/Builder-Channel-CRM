import "server-only";

import type { UiModule } from "@/platform/registry/ui";

import { NotificationPreferencesTab } from "./components/preferences/preferences-tab";
import { AnnouncementBannerLoader, NotificationBellLoader } from "./components/shell-loaders";

/** Server-rendered contributions of the notifications engine (M06): bell, banner and profile preferences. */
export const notificationsUiModule: UiModule = {
  key: "notifications",
  extensions: {
    "app.header.action": [
      { key: "notifications.bell", order: 10, render: () => <NotificationBellLoader /> },
    ],
    "app.banner": [
      { key: "notifications.announcements", order: 10, render: () => <AnnouncementBannerLoader /> },
    ],
    "profile.tab": [
      {
        key: "notifications",
        label: "Notifications",
        order: 10,
        render: () => <NotificationPreferencesTab />,
      },
    ],
  },
};
