import { cookies } from "next/headers";

import { AppShell } from "@/components/shared/app-shell/app-shell";
import { SIDEBAR_COOKIE } from "@/components/shared/app-shell/constants";
import { RegionalSettingsProvider } from "@/components/shared/regional-settings";
import { getOrganizationBranding, getRegionalSettings } from "@/modules/organization";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Authenticated application shell (M01-20). Authentication is added in M02. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getRequestContext();
  const [regional, branding, cookieStore] = await Promise.all([
    getRegionalSettings(ctx),
    getOrganizationBranding(ctx),
    cookies(),
  ]);

  return (
    <RegionalSettingsProvider value={regional}>
      <AppShell
        organization={branding}
        user={{ name: ctx.actor.name, subtitle: "Sign-in arrives with user management" }}
        permissions={ctx.permissions.toArray()}
        defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "1"}
      >
        {children}
      </AppShell>
    </RegionalSettingsProvider>
  );
}
