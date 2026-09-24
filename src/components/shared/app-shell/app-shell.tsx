"use client";

import { Building, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { SIDEBAR_COOKIE } from "./constants";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";
import { type ShellUser, UserMenu } from "./user-menu";

export interface AppShellProps {
  organization: { name: string; logoUrl: string | null };
  user: ShellUser;
  permissions: readonly string[];
  defaultCollapsed?: boolean;
  children: ReactNode;
}

function Brand({
  organization,
  collapsed,
}: {
  organization: AppShellProps["organization"];
  collapsed: boolean;
}) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-2 font-semibold">
      {organization.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned URL from object storage
        <img
          src={organization.logoUrl}
          alt=""
          className="size-8 shrink-0 rounded-md object-contain"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building className="size-4" />
        </span>
      )}
      {!collapsed ? <span className="truncate">{organization.name}</span> : null}
    </Link>
  );
}

/**
 * Authenticated application layout (M01-20): collapsible sidebar on desktop/laptop, slide-over navigation on
 * tablets and smaller screens, and a top bar with theme and user menus.
 */
export function AppShell({
  organization,
  user,
  permissions,
  defaultCollapsed = false,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="flex min-h-svh bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn("flex h-14 items-center border-b px-4", collapsed && "justify-center px-2")}
        >
          <Brand organization={organization} collapsed={collapsed} />
        </div>
        <div className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          <NavLinks permissions={permissions} collapsed={collapsed} />
        </div>
        <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn(!collapsed && "w-full justify-start")}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed ? <span>Collapse</span> : null}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetHeader className="border-b">
                <SheetTitle>
                  <Brand organization={organization} collapsed={false} />
                </SheetTitle>
                <SheetDescription className="sr-only">Main navigation</SheetDescription>
              </SheetHeader>
              <div className="px-3 py-2">
                <NavLinks permissions={permissions} onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground lg:hidden">
            {organization.name}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>
        <main id="main-content" className="flex-1 px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
