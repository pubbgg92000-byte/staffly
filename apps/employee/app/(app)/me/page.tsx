"use client";

// TODO(v0.20): Replace hierarchical department implementation with dedicated
// Team entity. Until then, "my team" is derived from department.parent.

// TODO(v0.20): Add an Organization directory section here, gated by a new
// `org.directory.read` permission. See sprint v0.19 audit.

import {
  Badge,
  PageHeader,
  WidgetCard,
  toast,
  useMyEmployee,
} from "@staffly/ui";
import { Building2, Mail, MapPin, User, Users } from "lucide-react";
import Link from "next/link";

export default function MyOrgPage(): React.ReactNode {
  const { data: me, isLoading, isError, error } = useMyEmployee();

  if (!isLoading && !me && isError && error?.status === 404) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Org"
          subtitle="Your department, team, and reporting manager."
        />
        <WidgetCard
          title="No employee record"
          empty="Your account is not yet linked to an employee record. Ask your administrator to set this up."
        />
      </div>
    );
  }

  const dept = me?.department ?? null;
  const desig = me?.designation ?? null;
  const loc = me?.location ?? null;
  const mgr = me?.manager ?? null;
  const isInTeam = !!dept?.parentId;

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Org"
        subtitle="Your department, team, and reporting manager."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* My Department */}
        <WidgetCard
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" /> My
              Department
            </span>
          }
          loading={isLoading}
          error={
            isError && error?.status !== 404
              ? { message: "Failed to load." }
              : null
          }
          empty={!dept ? "You're not assigned to a department yet." : undefined}
        >
          {dept ? (
            <div className="space-y-2 text-sm">
              <div className="text-lg font-semibold">{dept.name}</div>
              {isInTeam && dept.parent ? (
                <div className="text-muted-foreground">
                  Part of{" "}
                  <span className="font-medium text-foreground">
                    {dept.parent.name}
                  </span>
                </div>
              ) : null}
              {desig ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>{desig.name}</span>
                  {desig.level != null ? (
                    <Badge variant="outline">L{desig.level}</Badge>
                  ) : null}
                </div>
              ) : null}
              {loc ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>
                    {loc.name}
                    {loc.city ? ` · ${loc.city}` : ""}
                    {loc.country ? ` · ${loc.country}` : ""}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </WidgetCard>

        {/* My Team — only when my dept is a sub-department */}
        <WidgetCard
          title={
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" /> My Team
            </span>
          }
          loading={isLoading}
          error={
            isError && error?.status !== 404
              ? { message: "Failed to load." }
              : null
          }
          empty={
            !isInTeam
              ? "You're not assigned to a team. Teams live as sub-departments of a parent department."
              : undefined
          }
        >
          {isInTeam && dept ? (
            <div className="space-y-2 text-sm">
              <div className="text-lg font-semibold">{dept.name}</div>
              {dept.parent ? (
                <div className="text-muted-foreground">
                  Under{" "}
                  <span className="font-medium text-foreground">
                    {dept.parent.name}
                  </span>
                </div>
              ) : null}
              <Badge variant="secondary">Team</Badge>
            </div>
          ) : null}
        </WidgetCard>

        {/* Reporting Manager */}
        <WidgetCard
          title={
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" /> Reporting
              Manager
            </span>
          }
          loading={isLoading}
          error={
            isError && error?.status !== 404
              ? { message: "Failed to load." }
              : null
          }
          empty={!mgr ? "No reporting manager assigned." : undefined}
          colSpan={2}
        >
          {mgr ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 text-sm">
                <div className="text-lg font-semibold">{mgr.displayName}</div>
                {mgr.designation ? (
                  <div className="text-muted-foreground">
                    {mgr.designation.name}
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {mgr.employeeCode}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`mailto:${mgr.workEmail}`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Link>
                <button
                  type="button"
                  onClick={() => copyEmail(mgr.workEmail)}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Copy address
                </button>
              </div>
            </div>
          ) : null}
        </WidgetCard>
      </div>
    </div>
  );
}
