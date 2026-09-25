import type { UiModule } from "@/platform/registry/ui";

import { ProfilePerformance } from "./components/profile-performance";

/** Server-rendered contributions of dashboards & reports (M10). */
export const analyticsUiModule: UiModule = {
  key: "analytics",
  extensions: {
    "profile.tab": [
      { key: "performance", label: "Performance", order: 5, render: () => <ProfilePerformance /> },
    ],
  },
};
