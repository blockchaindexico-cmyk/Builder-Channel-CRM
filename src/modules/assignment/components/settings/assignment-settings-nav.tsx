"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings/assignment/rules", label: "Rules" },
  { href: "/settings/assignment/reasons", label: "Reasons" },
  { href: "/settings/assignment/options", label: "Options" },
];

export function AssignmentSettingsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Lead assignment settings"
      className="mb-6 inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            pathname === tab.href && "bg-background text-foreground shadow-sm",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
