"use client";

// TODO(v0.20): Replace hierarchical department implementation with dedicated Team entity.

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@staffly/ui";
import { DepartmentsView } from "./_components/DepartmentsView";
import { DesignationsView } from "./_components/DesignationsView";
import { LocationsView } from "./_components/LocationsView";
import { HierarchyView } from "./_components/HierarchyView";
import { VIEWS, type ViewKey } from "./_components/shared";

function OrgStructureContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();
  const view = ((sp.get("view") as ViewKey) ?? "departments") as ViewKey;
  const search = sp.get("search") ?? "";
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Changing view/search resets the page cursor.
      if (updates.view !== undefined || updates.search !== undefined) {
        next.delete("page");
      }
      router.push(`/org-structure?${next.toString()}`);
    },
    [router, sp],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Org Structure"
        subtitle="Manage departments, teams, designations, locations, and the reporting hierarchy."
      />

      <div className="flex flex-wrap gap-2 border-b">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`pb-2 text-sm font-medium transition-colors ${
              view === v.key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => updateParams({ view: v.key, search: "" })}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "departments" ? <DepartmentsView /> : null}
      {view === "designations" ? (
        <DesignationsView
          search={search}
          page={page}
          onParamsChange={updateParams}
        />
      ) : null}
      {view === "locations" ? (
        <LocationsView
          search={search}
          page={page}
          onParamsChange={updateParams}
        />
      ) : null}
      {view === "hierarchy" ? <HierarchyView /> : null}
    </div>
  );
}

export default function AdminOrgStructurePage(): React.ReactNode {
  return (
    <Suspense>
      <OrgStructureContent />
    </Suspense>
  );
}
