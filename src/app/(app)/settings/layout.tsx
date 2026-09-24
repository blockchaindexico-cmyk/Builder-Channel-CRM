import { SettingsNav } from "@/components/shared/settings/settings-nav";
import { CORE_PERMISSIONS } from "@/modules/core";
import { requirePermission } from "@/platform/rbac/guard";
import { getRequestContext } from "@/platform/tenant/request-context";

/** Settings area (M01-24): sections contributed by modules through their manifests. */
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const ctx = await getRequestContext();
  requirePermission(ctx, CORE_PERMISSIONS.settingsAccess);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      <aside className="lg:w-56 lg:shrink-0">
        <SettingsNav permissions={ctx.permissions.toArray()} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
