"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { appRegistry } from "@/modules/registry";

/** Settings navigation built from module manifests, filtered by permissions (M01-24). */
export function SettingsNav({ permissions }: { permissions: readonly string[] }) {
  const pathname = usePathname();
  const allowed = new Set(permissions);
  const groups = appRegistry.settings({ has: (key) => allowed.has("*") || allowed.has(key) });

  return (
    <nav
      aria-label="Settings"
      className="flex gap-6 overflow-x-auto pb-2 lg:flex-col lg:gap-4 lg:overflow-visible"
    >
      {groups.map((group) => (
        <div key={group.group} className="flex shrink-0 flex-col gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.group}
          </p>
          {group.sections.map((section) => {
            const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
            const Icon = section.icon;
            return (
              <Link
                key={section.key}
                href={section.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent font-medium text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {section.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
