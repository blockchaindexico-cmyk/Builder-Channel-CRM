import { Building } from "lucide-react";

import { resolveDefaultOrganization } from "@/platform/tenant/resolve";

/** Layout for sign-in, forgot-password and reset-password pages. */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const organization = await resolveDefaultOrganization().catch(() => null);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building className="size-5" />
        </span>
        {organization?.name ?? "Builder Channel CRM"}
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-xs text-muted-foreground">Builder Channel CRM</p>
    </main>
  );
}
