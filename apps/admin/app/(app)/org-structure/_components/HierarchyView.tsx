"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  EmptyState,
  Skeleton,
  useEmployees,
  useOrgEmployeesByManager,
} from "@staffly/ui";
import { ChevronDown, ChevronRight, Network, User } from "lucide-react";
import type { EmployeeListItem } from "@staffly/types";

/**
 * Read-only org-chart tree. Roots = active employees with managerId == null.
 * Expanding a node lazy-fetches its direct reports.
 *
 * Limitation: the root query caps at 100 active employees (backend pageSize
 * max). Orgs larger than that would need a streaming approach.
 */
export function HierarchyView(): React.ReactNode {
  const { data, isLoading, isError } = useEmployees({
    pageSize: 100,
    status: "active",
    sortBy: "displayName",
  });

  const roots = useMemo<EmployeeListItem[]>(
    () => (data?.items ?? []).filter((e) => e.managerId == null),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load hierarchy. Try refreshing.
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-8 w-8" />}
        title="No top-of-org employees found"
        description="The hierarchy view starts from active employees with no manager assigned. Assign at least one employee with no manager to anchor the org chart."
      />
    );
  }

  const truncated = (data?.meta?.total ?? 0) > 100;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Read-only view. Change a manager from the employee edit form.
      </p>

      {truncated ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Showing the first 100 active employees. The full org chart for larger
          organizations isn&apos;t yet available.
        </div>
      ) : null}

      <div className="space-y-2">
        {roots.map((root) => (
          <Node key={root.id} employee={root} depth={0} />
        ))}
      </div>
    </div>
  );
}

function Node({
  employee,
  depth,
}: {
  employee: EmployeeListItem;
  depth: number;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError } = useOrgEmployeesByManager(
    expanded ? employee.id : null,
  );
  const reports = data?.items ?? [];

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
        style={{ marginLeft: depth * 24 }}
      >
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <User className="h-4 w-4 text-muted-foreground" />

        <div className="flex-1 truncate">
          <span className="font-medium">{employee.displayName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {employee.employeeCode}
          </span>
          {employee.designation ? (
            <span className="ml-2 text-xs text-muted-foreground">
              · {employee.designation.name}
            </span>
          ) : null}
          {employee.department ? (
            <Badge variant="outline" className="ml-2">
              {employee.department.name}
            </Badge>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-2">
          {isLoading ? (
            <div style={{ marginLeft: (depth + 1) * 24 }}>
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isError ? (
            <div
              style={{ marginLeft: (depth + 1) * 24 }}
              className="rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
            >
              Failed to load reports.
            </div>
          ) : reports.length === 0 ? (
            <div
              style={{ marginLeft: (depth + 1) * 24 }}
              className="text-xs italic text-muted-foreground"
            >
              No direct reports.
            </div>
          ) : (
            reports.map((r) => (
              <Node key={r.id} employee={r} depth={depth + 1} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
