"use client";

import { useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  toast,
  useMyDocuments,
} from "@staffly/ui";
import type { MyDocumentItem } from "@staffly/types";
import { CheckCircle2, FileText } from "lucide-react";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(dueBy: string | null): boolean {
  if (!dueBy) return false;
  return new Date(dueBy) < new Date();
}

function DocumentCard({
  doc,
  onClick,
}: {
  doc: MyDocumentItem;
  onClick: () => void;
}): React.ReactNode {
  const ack = doc.acknowledgements[0] ?? null;
  const acknowledged = !!ack;
  const overdue = isOverdue(doc.dueBy) && !acknowledged;

  return (
    <article
      className="cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate font-semibold">{doc.title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {doc.isRequired &&
            (acknowledged ? (
              <Badge variant="success" className="text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Acknowledged
              </Badge>
            ) : (
              <Badge variant="warning" className="text-xs">
                Action required
              </Badge>
            ))}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: doc.category.color }}
          />
          {doc.category.name}
        </span>
        {doc.publishedAt ? (
          <span>Published {fmtDate(doc.publishedAt)}</span>
        ) : null}
        {doc.dueBy ? (
          <span className={overdue ? "text-destructive" : ""}>
            Due {fmtDate(doc.dueBy)}
            {overdue ? " (overdue)" : ""}
          </span>
        ) : null}
        {doc.currentVersion ? (
          <span>v{doc.currentVersion.versionNo}</span>
        ) : null}
      </div>
    </article>
  );
}

function DocumentsFeedContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const filterParam = sp.get("filter") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const { data, isLoading, isError, refetch } = useMyDocuments({
    page: pageParam,
    pageSize: 20,
    unacknowledgedOnly: filterParam === "pending",
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.filter !== undefined) next.delete("page");
      router.push(`/documents?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (isError)
      toast.error("Failed to load documents", {
        action: { label: "Retry", onClick: refetch },
      });
  }, [isError, refetch]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Documents" />
        <div className="w-40">
          <Select
            id="filter"
            value={filterParam}
            onChange={(e) => updateParams({ filter: e.target.value })}
            aria-label="Filter documents"
          >
            <option value="">All</option>
            <option value="pending">Pending ack</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title={filterParam === "pending" ? "Nothing pending" : "No documents"}
          description={
            filterParam === "pending"
              ? "You've acknowledged all required documents."
              : "Documents assigned to you will appear here."
          }
          action={
            filterParam ? (
              <Button
                variant="outline"
                onClick={() => updateParams({ filter: "" })}
              >
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onClick={() => router.push(`/documents/${doc.id}`)}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Showing {(meta.page - 1) * meta.pageSize + 1}–
                {Math.min(meta.page * meta.pageSize, meta.total)} of{" "}
                {meta.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page <= 1}
                  onClick={() => updateParams({ page: String(meta.page - 1) })}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => updateParams({ page: String(meta.page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function EmployeeDocumentsPage(): React.ReactNode {
  return (
    <Suspense>
      <DocumentsFeedContent />
    </Suspense>
  );
}
