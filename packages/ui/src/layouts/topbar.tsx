"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { Brand } from "../components/brand";
import { SidebarMobileNav } from "./sidebar";
import { UserMenu } from "./user-menu";
import type { NavItem } from "./types";

/**
 * 56 px-tall top bar shared by Admin and Employee layouts. Includes the
 * mobile sidebar trigger (Sheet), brand, and user menu.
 */
export function Topbar({
  items,
  pathname,
  portalLabel,
}: {
  items: NavItem[];
  pathname: string;
  portalLabel?: string;
}): React.ReactNode {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur md:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="rounded-md p-2 hover:bg-accent md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-4">
          <SidebarMobileNav
            items={items}
            pathname={pathname}
            portalLabel={portalLabel}
          />
        </SheetContent>
      </Sheet>
      <div className="md:hidden">
        <Brand size="sm" portalLabel={portalLabel} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <UserMenu />
      </div>
    </header>
  );
}
