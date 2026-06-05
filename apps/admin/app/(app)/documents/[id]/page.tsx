"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Separator,
  Sheet,
  SheetContent,
  SheetPortal,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useArchiveDocument,
  useDeleteDocument,
  useDocument,
  useDocumentAcknowledgements,
  useGetDownloadUrl,
  usePendingAck,
  usePublishDocument,
  useReplaceFile,
  useRestoreDocument,
  useUnarchiveDocument,
  useUpdateDocument,
  uploadToPresignedUrl,
  usePresignUpload,
  ConfirmDialog,
} from "@staffly/ui";
import type { DocumentVersion } from "@staffly/types";
import {
  ArrowLeft,
  Download,
  FileText,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";

const AUDIENCE_LABELS: Record<string, string> = {
  all_employees: "All employees",
  department: "Department",
  designation: "Designation",
  location: "Location",
  employment_type: "Employment type",
  specific_employees: "Specific employee",
};

function docStatus(
  publishedAt: string | null,
  archivedAt: string | null,
): "draft" | "published" | "archived" {
  if (archivedAt) return "archived";
  if (publishedAt) return "published";
  return "draft";
}

const STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  published: "success",
  archived: "destructive",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSize(bytes: string | number): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function VersionRow({
  v,
  onDownload,
}: {
  v: DocumentVersion;
  onDownload: (versionNo: number) => void;
}): React.ReactNode {
  return (
    <tr className="hover:bg-accent/40">
      <td className="px-4 py-3 tabular-nums">v{v.versionNo}</td>
      <td className="px-4 py-3">{v.fileName}</td>
      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
        {v.mimeType}
      </td>
      <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
        {fmtSize(v.sizeBytes)}
      </td>
      <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
        {fmtDateTime(v.uploadedAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDownload(v.versionNo)}
        >
          <Download className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export default function AdminDocumentDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: doc, isLoading, isError, refetch } = useDocument(id);
  const { data: acksData, isLoading: acksLoading } =
    useDocumentAcknowledgements(id);
  const { data: pendingData } = usePendingAck(
    doc?.isRequired && doc?.publishedAt ? id : undefined,
  );

  const publish = usePublishDocument();
  const archive = useArchiveDocument();
  const unarchive = useUnarchiveDocument();
  const deleteDoc = useDeleteDocument();
  const restore = useRestoreDocument();
  const update = useUpdateDocument();
  const replace = useReplaceFile();
  const presign = usePresignUpload();
  const getDownloadUrl = useGetDownloadUrl();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [unarchiveOpen, setUnarchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDueBy, setEditDueBy] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editOpen && doc) {
      setEditTitle(doc.title);
      setEditDesc(doc.description ?? "");
      setEditDueBy(doc.dueBy ? doc.dueBy.slice(0, 10) : "");
      setEditExpiresAt(
        doc.expiresAt ? new Date(doc.expiresAt).toISOString().slice(0, 16) : "",
      );
    }
  }, [editOpen, doc]);

  const handlePublish = async () => {
    if (!doc) return;
    try {
      await publish.mutateAsync(doc.id);
      toast.success("Document published");
      refetch();
    } catch {
      toast.error("Failed to publish");
    }
  };

  const handleArchive = async () => {
    if (!doc) return;
    try {
      await archive.mutateAsync(doc.id);
      toast.success("Document archived");
      refetch();
    } catch {
      toast.error("Failed to archive");
    }
  };

  const handleUnarchive = async (): Promise<void> => {
    if (!doc) return;
    try {
      await unarchive.mutateAsync(doc.id);
      toast.success("Document unarchived");
      setUnarchiveOpen(false);
      refetch();
    } catch {
      toast.error("Failed to unarchive");
      setUnarchiveOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    try {
      await deleteDoc.mutateAsync(doc.id);
      toast.success("Document deleted");
      router.push("/documents");
    } catch {
      toast.error("Failed to delete");
      setDeleteOpen(false);
    }
  };

  const handleRestore = async (): Promise<void> => {
    if (!doc) return;
    try {
      await restore.mutateAsync(doc.id);
      toast.success("Document restored");
      setRestoreOpen(false);
      refetch();
    } catch {
      toast.error("Failed to restore");
      setRestoreOpen(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!doc) return;
    try {
      await update.mutateAsync({
        id: doc.id,
        body: {
          title: editTitle || undefined,
          description: editDesc || null,
          dueBy: editDueBy || null,
          expiresAt: editExpiresAt
            ? new Date(editExpiresAt).toISOString()
            : null,
        },
      });
      toast.success("Document updated");
      setEditOpen(false);
      refetch();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doc) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("File too large. Max 100 MB.");
      return;
    }
    try {
      const result = await presign.mutateAsync({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      await uploadToPresignedUrl(result.url, file);
      await replace.mutateAsync({
        id: doc.id,
        file: {
          storageKey: result.key,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });
      toast.success(
        "File replaced — now v" + ((doc.currentVersion?.versionNo ?? 0) + 1),
      );
      refetch();
    } catch {
      toast.error("Failed to replace file");
    }
  };

  const handleDownload = async (versionNo?: number) => {
    if (!doc) return;
    try {
      const result = await getDownloadUrl.mutateAsync({
        id: doc.id,
        versionNo,
      });
      window.open(result.url, "_blank");
    } catch {
      toast.error("Failed to get download link");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !doc) {
    return (
      <div className="space-y-6">
        <PageHeader title="Document not found" />
        <EmptyState
          title="Could not load this document"
          description="It may have been deleted."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const status = docStatus(doc.publishedAt, doc.archivedAt);
  const isDraft = status === "draft";
  const isPublished = status === "published";
  const isArchived = status === "archived";
  const pendingCount = pendingData?.pendingEmployeeIds.length ?? 0;
  const isReplacing = presign.isPending || replace.isPending;

  return (
    <div className="space-y-6">
      <Link
        href="/documents"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to documents
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{doc.title}</h1>
            <StatusBadge tone={STATUS_TONE[status]}>{status}</StatusBadge>
            {doc.deletedAt ? <Badge variant="archived">Deleted</Badge> : null}
            {doc.isRequired ? <Badge variant="warning">Required</Badge> : null}
            {doc.isPersonal ? <Badge variant="outline">Personal</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <span
              className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ backgroundColor: doc.category.color }}
            />
            {doc.category.name}
            {doc.dueBy ? ` · Due ${fmtDate(doc.dueBy)}` : ""}
            {doc.expiresAt ? ` · Expires ${fmtDate(doc.expiresAt)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!isArchived ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          ) : null}
          {isDraft ? (
            <Button
              onClick={handlePublish}
              disabled={!doc.currentVersionId || publish.isPending}
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </Button>
          ) : null}
          {isPublished ? (
            <>
              <Button
                variant="outline"
                onClick={() => replaceInputRef.current?.click()}
                disabled={isReplacing}
              >
                <Upload className="h-4 w-4" />
                {isReplacing ? "Uploading…" : "Replace file"}
              </Button>
              <input
                ref={replaceInputRef}
                type="file"
                className="sr-only"
                onChange={handleReplaceFile}
              />
              <Button
                variant="destructive"
                onClick={handleArchive}
                disabled={archive.isPending}
              >
                Archive
              </Button>
            </>
          ) : null}
          {isDraft ? (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : null}
          {isArchived && !doc.deletedAt ? (
            <Button onClick={() => setUnarchiveOpen(true)}>
              <Undo2 className="h-4 w-4" />
              Unarchive
            </Button>
          ) : null}
          {doc.deletedAt ? (
            <Button onClick={() => setRestoreOpen(true)}>
              <Undo2 className="h-4 w-4" />
              Restore
            </Button>
          ) : null}
        </div>
      </div>

      {/* Description */}
      {doc.description ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold">Description</h2>
          <p className="text-sm text-muted-foreground">{doc.description}</p>
        </div>
      ) : null}

      {/* Current file */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Current file</h2>
        {doc.currentVersion ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{doc.currentVersion.fileName}</p>
              <p className="text-xs text-muted-foreground">
                v{doc.currentVersion.versionNo} · {doc.currentVersion.mimeType}{" "}
                · {fmtSize(doc.currentVersion.sizeBytes)} · Uploaded{" "}
                {fmtDateTime(doc.currentVersion.uploadedAt)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload()}
              disabled={getDownloadUrl.isPending}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No file attached yet.</p>
        )}
      </div>

      {/* Version history */}
      {doc.versions.length > 1 ? (
        <div className="rounded-lg border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">
              Version history ({doc.versions.length})
            </h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Ver</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Type
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    Size
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    Uploaded
                  </th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {doc.versions.map((v) => (
                  <VersionRow key={v.id} v={v} onDownload={handleDownload} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Audience */}
      {!doc.isPersonal && doc.audiences.length > 0 ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Audience</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {doc.audiences.map((a) => (
              <li key={a.id}>
                {AUDIENCE_LABELS[a.audienceType] ?? a.audienceType}
                {a.departmentId ? ` · id:${a.departmentId}` : ""}
                {a.designationId ? ` · id:${a.designationId}` : ""}
                {a.locationId ? ` · id:${a.locationId}` : ""}
                {a.employmentType ? ` · ${a.employmentType}` : ""}
                {a.employeeId ? ` · id:${a.employeeId}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Acknowledgements */}
      {doc.isRequired ? (
        <div className="rounded-lg border bg-card">
          <header className="border-b px-5 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">
                Acknowledgements ({doc._count.acknowledgements})
              </h2>
              {pendingCount > 0 ? (
                <p className="text-xs text-warning">{pendingCount} pending</p>
              ) : null}
            </div>
          </header>
          {acksLoading ? (
            <div className="space-y-2 p-5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (acksData?.items ?? []).length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No acknowledgements yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">
                      Code
                    </th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">
                      Email
                    </th>
                    <th className="px-4 py-3 font-medium">Version</th>
                    <th className="px-4 py-3 font-medium">Acknowledged</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(acksData?.items ?? []).map((ack) => (
                    <tr key={ack.id}>
                      <td className="px-4 py-3 font-medium">
                        {ack.employee.displayName}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {ack.employee.employeeCode}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                        {ack.employee.workEmail}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        v{ack.versionNo}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {fmtDateTime(ack.acknowledgedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetPortal>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            <div className="space-y-5 pb-8">
              <h2 className="text-lg font-semibold">Edit document</h2>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="e-title">Title</Label>
                  <Input
                    id="e-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-desc">Description</Label>
                  <textarea
                    id="e-desc"
                    rows={4}
                    className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="e-due">Due by</Label>
                    <Input
                      id="e-due"
                      type="date"
                      value={editDueBy}
                      onChange={(e) => setEditDueBy(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="e-expires">Expires at</Label>
                    <Input
                      id="e-expires"
                      type="datetime-local"
                      value={editExpiresAt}
                      onChange={(e) => setEditExpiresAt(e.target.value)}
                    />
                  </div>
                </div>
                {isPublished ? (
                  <p className="text-xs text-muted-foreground">
                    Audience and "required" settings are locked once published.
                  </p>
                ) : null}
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={update.isPending}
                  >
                    {update.isPending ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </SheetPortal>
      </Sheet>

      {/* Delete confirmation — soft-delete; recoverable via "Show deleted" + Restore. */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="destructive"
        title="Delete this document?"
        description="Soft-deletes the document. You can recover it from the documents list by toggling 'Show deleted'."
        confirmLabel="Delete document"
        pendingLabel="Deleting…"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={unarchiveOpen}
        onOpenChange={setUnarchiveOpen}
        title="Unarchive this document?"
        description="The document returns to a publishable state. Its audience and version history are preserved."
        confirmLabel="Unarchive"
        pendingLabel="Unarchiving…"
        onConfirm={handleUnarchive}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Restore this document?"
        description="Brings the document back into the documents list. Acknowledgement history is preserved."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={handleRestore}
      />
    </div>
  );
}
