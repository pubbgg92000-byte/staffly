"use client";

import type { ReactNode } from "react";
import { AdminLayout, type NavItem } from "@staffly/ui";
import { LayoutDashboard } from "lucide-react";

/**
 * Phase 1 nav — Dashboard only. Later phases append Employees, Attendance,
 * Leave, Documents, Announcements, Holidays, Settings entries here.
 */
const nav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
  },
];

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <AdminLayout nav={nav}>{children}</AdminLayout>;
}
