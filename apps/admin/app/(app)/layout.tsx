"use client";

import type { ReactNode } from "react";
import { AdminLayout, type NavItem } from "@staffly/ui";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Scale,
  PartyPopper,
  Megaphone,
  FileText,
  Building,
  Building2,
  Palette,
  Shield,
  UserCog,
  Mail,
  ScrollText,
  Bell,
} from "lucide-react";

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
  // Auth-only (self-scoped) — no permission gate; every user has notifications.
  { href: "/notifications", label: "Notifications", icon: Bell },
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
  {
    href: "/leave",
    label: "Leave Requests",
    icon: CalendarDays,
    permission: "leave.read",
  },
  {
    href: "/leave/balances",
    label: "Balances",
    icon: Scale,
    permission: "leave.read",
  },
  {
    href: "/holidays",
    label: "Holidays",
    icon: PartyPopper,
    permission: "holiday.read",
  },
  {
    href: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    permission: "announcement.read",
  },
  {
    href: "/documents",
    label: "Documents",
    icon: FileText,
    permission: "document.read",
  },
  {
    href: "/org-structure",
    label: "Org Structure",
    icon: Building2,
    permission: "org.structure.read",
  },
  {
    href: "/settings/organization",
    label: "Organization",
    icon: Building,
    permission: "org.settings.read",
  },
  {
    href: "/settings/branding",
    label: "Branding",
    icon: Palette,
    permission: "org.settings.read",
  },
  {
    href: "/settings/roles",
    label: "Roles",
    icon: Shield,
    permission: "rbac.read",
  },
  {
    href: "/settings/users",
    label: "Users",
    icon: UserCog,
    permission: "rbac.read",
  },
  {
    href: "/settings/invites",
    label: "Invites",
    icon: Mail,
    permission: "employee.invite",
  },
  {
    href: "/settings/audit-log",
    label: "Audit Log",
    icon: ScrollText,
    permission: "audit.read",
  },
];

export default function AppGroupLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return <AdminLayout nav={nav}>{children}</AdminLayout>;
}
