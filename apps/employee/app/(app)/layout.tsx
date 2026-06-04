"use client";

import type { ReactNode } from "react";
import { EmployeeLayout, type NavItem } from "@staffly/ui";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  FileText,
  Megaphone,
} from "lucide-react";

/**
 * Bottom-tab nav. "More" placeholder replaced with "Announcements" once
 * the announcements feed was shipped in v0.17.
 */
const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave", icon: Calendar },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
];

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <EmployeeLayout nav={nav}>{children}</EmployeeLayout>;
}
