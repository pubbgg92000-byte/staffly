"use client";

import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  useAuditLog,
} from "@staffly/ui";
import type { AuditLogListItem } from "@staffly/types";
import { JsonViewer } from "./json-viewer";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function Section({
  title,
  value,
}: {
  title: string;
  value: unknown;
}): React.ReactNode {
  return (
    <div className="space-y-1.5">
      <h3 className="font-medium text-sm">{title}</h3>
      <JsonViewer value={value} />
    </div>
  );
}

export function AuditDetailDialog({
  entry,
  onOpenChange,
}: {
  entry: AuditLogListItem | null;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  const { data, isLoading } = useAuditLog(entry?.id);

  const actor =
    entry?.actorName ?? entry?.actorEmail ?? entry?.actorUserId ?? "System";

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline">{entry?.action}</Badge>
          </DialogTitle>
          <DialogDescription>
            {entry ? new Date(entry.createdAt).toLocaleString() : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Row label="Actor">{actor}</Row>
          <Row label="Actor email">{entry?.actorEmail ?? "—"}</Row>
          <Row label="IP">{entry?.actorIp ?? "—"}</Row>
          <Row label="Resource type">{entry?.resourceType ?? "—"}</Row>
          <Row label="Resource ID">
            <span className="break-all font-mono text-xs">
              {entry?.resourceId ?? "—"}
            </span>
          </Row>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <Section title="Before" value={data?.before ?? null} />
            <Section title="After" value={data?.after ?? null} />
            <Section title="Metadata" value={data?.metadata ?? null} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
