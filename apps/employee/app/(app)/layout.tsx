"use client";

import type { ReactNode } from "react";
import { EmployeeLayout, type NavItem } from "@staffly/ui";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  FileText,
  Megaphone,
  Building2,
} from "lucide-react";
import { SessionGate } from "./_components/session-gate";

/**
 * Bottom-tab nav. "More" placeholder replaced with "Announcements" once
 * the announcements feed was shipped in v0.17. "My Org" added in v0.19.
 */
const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave", icon: Calendar },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/announcements", label: "Announcements", icon: Megaphone },
  { href: "/me", label: "My Org", icon: Building2 },
];

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <SessionGate>
      <EmployeeLayout nav={nav}>{children}</EmployeeLayout>
    </SessionGate>
  );
}
