import { cookies } from "next/headers";

import { AppShell } from "@/components/shared/app-shell/app-shell";
import { SIDEBAR_COOKIE } from "@/components/shared/app-shell/constants";
import { PermissionsProvider } from "@/components/shared/permissions";
import { RegionalSettingsProvider } from "@/components/shared/regional-settings";
import { CORE_PERMISSIONS } from "@/modules/core";
import { getMyAvatarUrl } from "@/modules/identity";
import { getOrganizationBranding, getRegionalSettings } from "@/modules/organization";
import { getCurrentUser, getRequestContext } from "@/platform/tenant/request-context";

/** Authenticated application shell (M01-20); every page below requires a signed-in, active member (M02). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getRequestContext();
  const [user, regional, branding, avatarUrl, cookieStore] = await Promise.all([
    getCurrentUser(),
    getRegionalSettings(ctx),
    getOrganizationBranding(ctx),
    getMyAvatarUrl(ctx),
    cookies(),
  ]);

  return (
    <RegionalSettingsProvider value={regional}>
      <PermissionsProvider value={ctx.permissions.toJSON()}>
        <AppShell
          organization={branding}
          user={{
            name: user.name,
            email: user.email,
            subtitle: user.roleName,
            avatarUrl,
            canOpenSettings: ctx.permissions.has(CORE_PERMISSIONS.settingsAccess),
          }}
          permissions={ctx.permissions.toArray()}
          defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "1"}
        >
          {children}
        </AppShell>
      </PermissionsProvider>
    </RegionalSettingsProvider>
  );
}
