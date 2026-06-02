"use client";

import type { ReactNode } from "react";
import { EmployeeLayout, type NavItem } from "@staffly/ui";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  FileText,
  MoreHorizontal,
} from "lucide-react";

/**
 * Phase 1 nav — Dashboard only is live. Attendance/Leave/Documents/More
 * are visible in the bottom-tab navigation per docs/06 §22 but currently
 * route to placeholder 404s; they slot in during later phases.
 */
const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave", icon: Calendar },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/more", label: "More", icon: MoreHorizontal },
];

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <EmployeeLayout nav={nav}>{children}</EmployeeLayout>;
}
