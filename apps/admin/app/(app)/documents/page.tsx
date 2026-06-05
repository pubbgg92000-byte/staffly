"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useDocumentCategories,
  useDocuments,
} from "@staffly/ui";
import type { DocumentListParams } from "@staffly/types";
import { FileText, FolderOpen, Plus, Search } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  published: "success",
  archived: "archived",
};

function docStatus(
  publishedAt: string | null,
  archivedAt: string | null,
): string {
  if (archivedAt) return "archived";
  if (publishedAt) return "published";
  return "draft";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DocumentsContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const searchParam = sp.get("search") ?? "";
  const statusParam = sp.get("status") ?? "";
  const categoryParam = sp.get("categoryId") ?? "";
  const includeDeleted = sp.get("includeDeleted") === "1";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(searchParam);

  const listParams: DocumentListParams = {
    page: pageParam,
    pageSize: 20,
    search: searchParam || undefined,
    status: (statusParam as DocumentListParams["status"]) || undefined,
    categoryId: categoryParam || undefined,
    includeDeleted: includeDeleted || undefined,
  };

  const { data, isLoading, isError, refetch } = useDocuments(listParams);
  const { data: categories } = useDocumentCategories({ pageSize: 100 });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (
        updates.search !== undefined ||
        updates.status !== undefined ||
        updates.categoryId !== undefined
      )
        next.delete("page");
      router.push(`/documents?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== searchParam) updateParams({ search });
    }, 300);
    return () => clearTimeout(t);
  }, [search, searchParam, updateParams]);

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
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Company documents and compliance files"
        actions={
          <div className="flex gap-2">
            <Link href="/documents/categories">
              <Button variant="outline">
                <FolderOpen className="h-4 w-4" />
                Categories
              </Button>
            </Link>
            <Link href="/documents/new">
              <Button>
                <Plus className="h-4 w-4" />
                Upload document
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by title…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:w-44">
          <Select
            id="category"
            value={categoryParam}
            onChange={(e) => updateParams({ categoryId: e.target.value })}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {(categories?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select
            id="status"
            value={statusParam}
            onChange={(e) => updateParams({ status: e.target.value })}
            aria-label="Status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap sm:pb-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={includeDeleted}
            onChange={(e) =>
              updateParams({ includeDeleted: e.target.checked ? "1" : "" })
            }
          />
          Show deleted
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Category
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Required
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Version
              </th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">
                Due by
              </th>
              <th className="hidden px-4 py-3 font-medium xl:table-cell">
                Acks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-8" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-8" />
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <Skeleton className="h-4 w-8" />
                    </td>
                  </tr>
                ))
              : items.map((doc) => {
                  const status = docStatus(doc.publishedAt, doc.archivedAt);
                  return (
                    <tr
                      key={doc.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => router.push(`/documents/${doc.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{doc.title}</span>
                          {doc.isPersonal ? (
                            <Badge variant="outline" className="text-xs">
                              Personal
                            </Badge>
                          ) : null}
                          {doc.deletedAt ? (
                            <Badge variant="archived" className="text-xs">
                              Deleted
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: doc.category.color,
                            }}
                          />
                          <span>{doc.category.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={STATUS_TONE[status] ?? "muted"}>
                          {status}
                        </StatusBadge>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {doc.isRequired ? (
                          <Badge variant="warning">Required</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                        v{doc.currentVersion?.versionNo ?? "—"}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums xl:table-cell">
                        {fmtDate(doc.dueBy)}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums xl:table-cell">
                        {doc.isRequired ? doc._count.acknowledgements : "—"}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No documents"
          description={
            searchParam || statusParam || categoryParam
              ? "Try adjusting your filters."
              : "Upload your first document to get started."
          }
          action={
            !searchParam && !statusParam && !categoryParam ? (
              <Link href="/documents/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Upload document
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {(meta.page - 1) * meta.pageSize + 1}–
            {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
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
    </div>
  );
}

export default function AdminDocumentsPage(): React.ReactNode {
  return (
    <Suspense>
      <DocumentsContent />
    </Suspense>
  );
}
