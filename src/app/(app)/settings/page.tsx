import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { appRegistry } from "@/modules/registry";
import { getRequestContext } from "@/platform/tenant/request-context";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsIndexPage() {
  const ctx = await getRequestContext();
  const groups = appRegistry.settings(ctx.permissions);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure your organization and how the CRM works."
      />
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.group} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">{group.group}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.sections.map((section) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={section.key}
                    href={section.href}
                    className="group rounded-xl focus-visible:outline-none"
                  >
                    <Card className="h-full transition-colors group-hover:border-primary/40 group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50">
                      <CardHeader>
                        <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <CardTitle>{section.label}</CardTitle>
                        <CardDescription>{section.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
