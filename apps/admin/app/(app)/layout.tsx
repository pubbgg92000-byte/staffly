"use client";

import type { ReactNode } from "react";
import { AdminLayout, type NavItem } from "@staffly/ui";
import { LayoutDashboard, Users, Clock } from "lucide-react";

/**
 * Phase 1 nav — Dashboard only. Later phases append Leave, Documents,
 * Announcements, Holidays, Settings entries here.
 */
const nav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
  },
  {
    href: "/employees",
    label: "Employees",
    icon: Users,
    permission: "employee.read",
  },
  {
    href: "/attendance",
    label: "Attendance",
    icon: Clock,
    permission: "attendance.read",
  },
];

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <AdminLayout nav={nav}>{children}</AdminLayout>;
}
