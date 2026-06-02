"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NavItem } from "./types";
import { Brand } from "../components/brand";
import { cn } from "../lib/cn";

const STORAGE_KEY = "sf:sidebar:collapsed";

/**
 * Desktop sidebar: collapsible (256 px expanded, 64 px collapsed). Persists
 * collapse state in localStorage so it survives a refresh.
 *
 * Active highlighting compares the current `pathname` against each item's
 * `href` (exact match or `pathname.startsWith(href + '/')` for nested
 * routes). Hidden under `md` — the layout swaps to a Sheet trigger from
 * the Topbar.
 */
export function Sidebar({
  items,
  pathname,
  portalLabel,
}: {
  items: NavItem[];
  pathname: string;
  portalLabel?: string;
}): React.ReactNode {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore — SSR or storage unavailable
    }
  }, []);

  const toggle = (): void => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 border-r bg-card transition-[width] md:flex md:flex-col",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label="Primary navigation"
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        {collapsed ? null : <Brand size="sm" portalLabel={portalLabel} />}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={toggle}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-3">
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            collapsed={collapsed}
            active={isActive(pathname, item.href)}
          />
        ))}
      </nav>
    </aside>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}): React.ReactNode {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
    >
      {Icon ? (
        <Icon className="h-4 w-4 shrink-0" />
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      {collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge ? (
        <span className="ml-auto rounded-full bg-primary px-1.5 text-xs font-medium tabular-nums text-primary-foreground">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Mobile variant used inside a Sheet. Always expanded. */
export function SidebarMobileNav({
  items,
  pathname,
  portalLabel,
}: {
  items: NavItem[];
  pathname: string;
  portalLabel?: string;
}): React.ReactNode {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center">
        <Brand size="md" portalLabel={portalLabel} />
      </div>
      <nav className="flex-1 space-y-1">
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            collapsed={false}
            active={isActive(pathname, item.href)}
          />
        ))}
      </nav>
    </div>
  );
}
