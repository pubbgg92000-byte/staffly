"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomTabNav } from "./bottom-tab-nav";
import type { NavItem } from "./types";

/**
 * Employee shell: mobile-first. Sidebar hidden under `md`; under `sm` we
 * surface a 5-tab bottom nav.
 */
export function EmployeeLayout({
  children,
  nav,
}: {
  children: ReactNode;
  nav: NavItem[];
}): ReactNode {
  const pathname = usePathname() ?? "/";
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar items={nav} pathname={pathname} portalLabel="Employee" />
      <div className="flex min-h-screen flex-1 flex-col pb-16 sm:pb-0">
        <Topbar items={nav} pathname={pathname} portalLabel="Employee" />
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
      <BottomTabNav items={nav} pathname={pathname} />
    </div>
  );
}
