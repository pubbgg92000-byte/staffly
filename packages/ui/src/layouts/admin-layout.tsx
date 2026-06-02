"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { NavItem } from "./types";

/**
 * Admin shell: collapsible sidebar (≥ md) + 56 px Topbar + scroll content.
 * Mobile (< md) hides the sidebar; the Sheet in the Topbar provides nav.
 */
export function AdminLayout({
  children,
  nav,
}: {
  children: ReactNode;
  nav: NavItem[];
}): ReactNode {
  const pathname = usePathname() ?? "/";
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar items={nav} pathname={pathname} portalLabel="Admin" />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar items={nav} pathname={pathname} portalLabel="Admin" />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
