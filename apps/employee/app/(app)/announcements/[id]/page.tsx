"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useAnnouncement,
  useAcknowledgeAnnouncement,
} from "@staffly/ui";
import type { AnnouncementPriority } from "@staffly/types";
import { ArrowLeft, CheckCircle2, Pin } from "lucide-react";

const PRIORITY_TONE: Record<AnnouncementPriority, StatusTone> = {
  low: "muted",
  normal: "info",
  high: "destructive",
};

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

export default function EmployeeAnnouncementDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data: ann, isLoading, isError, refetch } = useAnnouncement(id);
  const acknowledge = useAcknowledgeAnnouncement();

  useEffect(() => {
    if (acknowledge.isError) toast.error("Failed to acknowledge. Try again.");
  }, [acknowledge.isError]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !ann) {
    return (
      <div className="space-y-6">
        <PageHeader title="Announcement not found" />
        <EmptyState
          title="Could not load this announcement"
          description="It may have been removed or you're not in its audience."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  // Employee feed items have embedded acknowledgements — but this detail
  // uses the admin GET /announcements/:id endpoint (announcement.read) which
  // doesn't embed per-user acks. We can't know if the current user has
  // acknowledged without the feed data. We optimistically show the button
  // and let the backend's idempotent endpoint handle re-acks gracefully.
  const handleAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync(ann.id);
      toast.success("Acknowledged");
      refetch();
    } catch {
      // error handled by useEffect above
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/announcements"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to announcements
      </Link>

      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ann.pinned ? (
            <Pin className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : null}
          <h1 className="text-xl font-semibold">{ann.title}</h1>
          <StatusBadge tone={PRIORITY_TONE[ann.priority]}>
            {ann.priority}
          </StatusBadge>
          {ann.requiresAcknowledgment ? (
            <Badge variant="outline">Requires acknowledgement</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Published {fmtDateTime(ann.publishedAt)}
          {ann.expiresAt ? ` · Expires ${fmtDateTime(ann.expiresAt)}` : ""}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <div
          className="prose prose-sm max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: ann.bodyHtml }}
        />
      </div>

      {ann.requiresAcknowledgment ? (
        <div className="rounded-lg border bg-card p-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Acknowledgement required</p>
            <p className="text-xs text-muted-foreground">
              Confirm you have read and understood this announcement.
            </p>
          </div>
          <Button onClick={handleAcknowledge} disabled={acknowledge.isPending}>
            <CheckCircle2 className="h-4 w-4" />
            {acknowledge.isPending ? "Saving…" : "Acknowledge"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
