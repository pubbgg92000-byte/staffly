"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  toast,
  useAcknowledgeDocument,
  useMyDocumentDownloadUrl,
  useMyDocuments,
} from "@staffly/ui";
import type { MyDocumentItem } from "@staffly/types";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
} from "lucide-react";

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

export default function EmployeeDocumentDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const acknowledge = useAcknowledgeDocument();
  const downloadUrl = useMyDocumentDownloadUrl();

  // Fetch from employee feed — load all documents to find this one
  // (employees don't have document.read permission for GET /documents/:id)
  const { data: feed, isLoading, refetch } = useMyDocuments({ pageSize: 100 });
  const [doc, setDoc] = useState<MyDocumentItem | null>(null);

  useEffect(() => {
    if (feed) {
      const found = feed.items.find((d) => d.id === id);
      setDoc(found ?? null);
    }
  }, [feed, id]);

  useEffect(() => {
    if (acknowledge.isError) toast.error("Failed to acknowledge. Try again.");
  }, [acknowledge.isError]);

  const handleAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync(id);
      toast.success("Acknowledged");
      refetch();
    } catch {
      // handled by effect
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-6">
        <PageHeader title="Document not found" />
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="Document not found"
          description="This document may not be assigned to you or may have been removed."
          action={
            <Button variant="outline" asChild>
              <Link href="/documents">Back to documents</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const ack = doc.acknowledgements[0] ?? null;
  const acknowledged = !!ack;
  const isOverdue =
    doc.dueBy && new Date(doc.dueBy) < new Date() && !acknowledged;

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
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          {doc.isRequired ? <Badge variant="warning">Required</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
            <span className={isOverdue ? "text-destructive font-medium" : ""}>
              Due {fmtDate(doc.dueBy)}
              {isOverdue ? " · Overdue" : ""}
            </span>
          ) : null}
          {doc.expiresAt ? <span>Expires {fmtDate(doc.expiresAt)}</span> : null}
        </div>
      </div>

      {/* Description */}
      {doc.description ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold">Description</h2>
          <p className="text-sm text-muted-foreground">{doc.description}</p>
        </div>
      ) : null}

      {/* File — open + download */}
      {doc.currentVersion ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">File</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">{doc.currentVersion.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.currentVersion.mimeType} ·{" "}
                  {fmtSize(doc.currentVersion.sizeBytes)} · v
                  {doc.currentVersion.versionNo}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={downloadUrl.isPending}
                onClick={async () => {
                  try {
                    const result = await downloadUrl.mutateAsync(id);
                    window.open(result.url, "_blank", "noopener,noreferrer");
                  } catch {
                    toast.error("Could not open file. Try again.");
                  }
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={downloadUrl.isPending}
                onClick={async () => {
                  try {
                    const result = await downloadUrl.mutateAsync(id);
                    const a = document.createElement("a");
                    a.href = result.url;
                    a.download = result.fileName;
                    a.click();
                  } catch {
                    toast.error("Could not download file. Try again.");
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Acknowledge */}
      {doc.isRequired ? (
        acknowledged ? (
          <div className="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-5">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-medium text-success">
                Acknowledged v{ack.versionNo}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDateTime(ack.acknowledgedAt)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Acknowledgement required</p>
              <p className="text-xs text-muted-foreground">
                Confirm you have read and understood this document.
              </p>
            </div>
            <Button
              onClick={handleAcknowledge}
              disabled={acknowledge.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              {acknowledge.isPending ? "Saving…" : "Acknowledge"}
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
