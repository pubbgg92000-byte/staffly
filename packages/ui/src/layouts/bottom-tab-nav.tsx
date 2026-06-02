"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "../lib/cn";
import type { NavItem } from "./types";

/**
 * 5-tab bottom navigation for the Employee portal under `sm`. Shows up to
 * five items; the last is a "More" sheet trigger if there are extras
 * (Phase 1 only has Dashboard so it's just one live tab; the rest are stubs
 * leading nowhere yet).
 */
export function BottomTabNav({
  items,
  pathname,
}: {
  items: NavItem[];
  pathname: string;
}): React.ReactNode {
  const visible = items.slice(0, 5);
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t bg-card/95 backdrop-blur sm:hidden"
    >
      {visible.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            {Icon ? <Icon className="h-5 w-5" /> : <span className="h-5 w-5" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
