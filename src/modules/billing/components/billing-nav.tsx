"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/billing", label: "Overview", need: "billing" },
  { href: "/billing/deals", label: "Deals", need: "finance" },
  { href: "/billing/invoices", label: "Invoices", need: "billing" },
  { href: "/billing/payments", label: "Collections", need: "billing" },
  { href: "/billing/expenses", label: "Expenses", need: "finance" },
] as const;

/** Tabs across the billing pages; each shows only with its permission. */
export function BillingNav({ billing, finance }: { billing: boolean; finance: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => (tab.need === "billing" ? billing : finance));
  const active = (href: string) =>
    href === "/billing" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <nav
      aria-label="Billing"
      className="mb-6 inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active(tab.href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            active(tab.href) && "bg-background text-foreground shadow-sm",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
