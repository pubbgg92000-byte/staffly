// TODO(v0.20): Replace hierarchical department implementation with dedicated Team entity.

import type { OrgDepartment, OrgDepartmentWithChildren } from "@staffly/types";

export const FRIENDLY_ERRORS: Record<string, string> = {
  "department.conflict_name_or_code":
    "A department with this name or code already exists.",
  "designation.conflict_name": "A designation with this name already exists.",
  "location.conflict_name": "A location with this name already exists.",
};

export function friendlyMsg(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? undefined;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const VIEWS = [
  { key: "departments" as const, label: "Departments" },
  { key: "designations" as const, label: "Designations" },
  { key: "locations" as const, label: "Locations" },
  { key: "hierarchy" as const, label: "Reporting Hierarchy" },
];

export type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * Build a parent→children tree from a flat list of departments. Anything whose
 * parentId is absent from the input is treated as a root (handles orphaned
 * children if a parent was soft-deleted).
 */
export function buildDeptTree(
  depts: OrgDepartment[],
): OrgDepartmentWithChildren[] {
  const byId = new Map<string, OrgDepartmentWithChildren>();
  for (const d of depts) byId.set(d.id, { ...d, children: [] });
  const roots: OrgDepartmentWithChildren[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortFn = (a: OrgDepartmentWithChildren, b: OrgDepartmentWithChildren) =>
    a.name.localeCompare(b.name);
  const sortRec = (ns: OrgDepartmentWithChildren[]): void => {
    ns.sort(sortFn);
    ns.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/**
 * Collect the IDs of `target` and all its transitive descendants. Used by the
 * department edit dialog to filter parent-picker options (best-effort cycle
 * prevention — the backend does not enforce this).
 */
export function descendantIds(
  tree: OrgDepartmentWithChildren[],
  targetId: string,
): Set<string> {
  const out = new Set<string>();
  const find = (
    nodes: OrgDepartmentWithChildren[],
  ): OrgDepartmentWithChildren | null => {
    for (const n of nodes) {
      if (n.id === targetId) return n;
      const found = find(n.children);
      if (found) return found;
    }
    return null;
  };
  const node = find(tree);
  if (!node) return out;
  const walk = (n: OrgDepartmentWithChildren): void => {
    out.add(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
