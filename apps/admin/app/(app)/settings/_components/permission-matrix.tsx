"use client";

import { useMemo, useState } from "react";
import { Badge, Input } from "@staffly/ui";
import { Search, ShieldCheck } from "lucide-react";
import type { Permission } from "@staffly/types";

/**
 * Permissions grouped by `resource`, with a search filter and full
 * descriptions. Supports three display modes:
 *
 *  - editable matrix (default): checkboxes; `onChange` receives the next
 *    `value` array on every toggle.
 *  - read-only matrix: `readOnly` is true; checkboxes disabled, layout
 *    unchanged so the user can still scan what's enabled.
 *  - "All permissions": `showAll` is true; renders a single placeholder
 *    chip (used for `super_admin`, whose permissions are the `*` sentinel).
 */
export function PermissionMatrix({
  permissions,
  value,
  onChange,
  readOnly = false,
  showAll = false,
}: {
  permissions: Permission[];
  value: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
  showAll?: boolean;
}): React.ReactNode {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? permissions.filter(
          (p) =>
            p.key.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.resource.toLowerCase().includes(q),
        )
      : permissions;
    const map = new Map<string, Permission[]>();
    for (const p of filtered) {
      const list = map.get(p.resource) ?? [];
      list.push(p);
      map.set(p.resource, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions, query]);

  const valueSet = useMemo(() => new Set(value), [value]);

  if (showAll) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-primary" />
        <p className="font-medium">All permissions</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This role has every permission in the system. It can only be assigned
          at organization bootstrap and cannot be edited.
        </p>
      </div>
    );
  }

  const toggle = (key: string): void => {
    if (readOnly || !onChange) return;
    if (valueSet.has(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  };

  const toggleResource = (resource: string, checked: boolean): void => {
    if (readOnly || !onChange) return;
    const keysInResource = permissions
      .filter((p) => p.resource === resource)
      .map((p) => p.key);
    const set = new Set(value);
    if (checked) {
      for (const k of keysInResource) set.add(k);
    } else {
      for (const k of keysInResource) set.delete(k);
    }
    onChange([...set]);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search permissions…"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="rounded-lg border">
        {grouped.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No permissions match your search.
          </p>
        ) : (
          grouped.map(([resource, perms]) => {
            const allKeys = permissions
              .filter((p) => p.resource === resource)
              .map((p) => p.key);
            const enabledCount = allKeys.filter((k) => valueSet.has(k)).length;
            const allEnabled =
              enabledCount > 0 && enabledCount === allKeys.length;
            const someEnabled =
              enabledCount > 0 && enabledCount < allKeys.length;
            return (
              <div key={resource} className="border-b last:border-b-0">
                <div className="flex items-center justify-between gap-3 bg-muted/30 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={allEnabled}
                        ref={(el) => {
                          if (el) el.indeterminate = someEnabled;
                        }}
                        onChange={(e) =>
                          toggleResource(resource, e.target.checked)
                        }
                        disabled={readOnly}
                      />
                      <span className="capitalize">
                        {resource.replace(/_/g, " ")}
                      </span>
                    </label>
                  </div>
                  <Badge variant="outline" className="text-xs tabular-nums">
                    {enabledCount}/{allKeys.length}
                  </Badge>
                </div>
                <ul className="divide-y">
                  {perms.map((p) => {
                    const checked = valueSet.has(p.key);
                    return (
                      <li key={p.key} className="px-4 py-2.5">
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-input"
                            checked={checked}
                            onChange={() => toggle(p.key)}
                            disabled={readOnly}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                                {p.key}
                              </code>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {p.description}
                            </p>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
