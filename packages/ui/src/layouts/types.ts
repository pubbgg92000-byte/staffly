import type { ComponentType, ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** When set, the item is hidden if the current user lacks the permission. */
  permission?: string;
  /** Optional badge count, hidden if 0/undefined. */
  badge?: number;
  /** Nested children for expandable groups. */
  children?: NavItem[];
}

export interface LayoutChildren {
  children: ReactNode;
}
