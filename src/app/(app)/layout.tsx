import { cookies } from "next/headers";
import { Fragment } from "react";

import { AppShell } from "@/components/shared/app-shell/app-shell";
import { SIDEBAR_COOKIE } from "@/components/shared/app-shell/constants";
import type { ShellContribution } from "@/components/shared/app-shell/extensions";
import { PermissionsProvider } from "@/components/shared/permissions";
import { RegionalSettingsProvider } from "@/components/shared/regional-settings";
import { CORE_PERMISSIONS } from "@/modules/core";
import { getMyAvatarUrl } from "@/modules/identity";
import { getOrganizationBranding, getRegionalSettings } from "@/modules/organization";
import { uiRegistry } from "@/modules/registry.ui";
import { getCurrentUser, getRequestContext } from "@/platform/tenant/request-context";

/** Renders the shell contributions of one extension point in order. */
async function renderShellPoint(point: "app.header.action" | "app.banner") {
  const items: readonly ShellContribution[] = uiRegistry.extensions(point);
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const rendered = await Promise.all(sorted.map((item) => item.render()));
  if (rendered.length === 0) return null;
  return rendered.map((node, index) => <Fragment key={sorted[index]!.key}>{node}</Fragment>);
}

/** Authenticated application shell (M01-20); every page below requires a signed-in, active member (M02). */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getRequestContext();
  const [user, regional, branding, avatarUrl, cookieStore, headerActions, banner] =
    await Promise.all([
      getCurrentUser(),
      getRegionalSettings(ctx),
      getOrganizationBranding(ctx),
      getMyAvatarUrl(ctx),
      cookies(),
      renderShellPoint("app.header.action"),
      renderShellPoint("app.banner"),
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
          headerActions={headerActions}
          banner={banner}
        >
          {children}
        </AppShell>
      </PermissionsProvider>
    </RegionalSettingsProvider>
  );
}
