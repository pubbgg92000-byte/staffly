"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Separator,
  Sheet,
  SheetContent,
  SheetPortal,
  Skeleton,
  StatusBadge,
  type StatusTone,
  ConfirmDialog,
  extractErrorMessage,
  toast,
  useAcknowledgements,
  useAnnouncement,
  useArchiveAnnouncement,
  useDepartments,
  useDesignations,
  useEmployees,
  useLocations,
  usePreviewAudience,
  usePublishAnnouncement,
  useRestoreAnnouncement,
  useUpdateAnnouncement,
} from "@staffly/ui";
import {
  AnnouncementSchema,
  type AnnouncementFormValues,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AudienceItem,
} from "@staffly/types";
import { ArrowLeft, Pin, Users } from "lucide-react";

const STATUS_TONE: Record<AnnouncementStatus, StatusTone> = {
  draft: "muted",
  scheduled: "warning",
  published: "success",
  archived: "archived",
};

const PRIORITY_TONE: Record<AnnouncementPriority, StatusTone> = {
  low: "muted",
  normal: "info",
  high: "destructive",
};

const AUDIENCE_LABELS: Record<string, string> = {
  all_employees: "All employees",
  department: "Department",
  designation: "Designation",
  location: "Location",
  employment_type: "Employment type",
  specific_employees: "Specific employee",
};

const AUDIENCE_TYPES = [
  { value: "all_employees", label: "All employees" },
  { value: "department", label: "Department" },
  { value: "designation", label: "Designation" },
  { value: "location", label: "Location" },
  { value: "employment_type", label: "Employment type" },
  { value: "specific_employees", label: "Specific employee" },
];

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "intern", label: "Intern" },
  { value: "contractor", label: "Contractor" },
  { value: "consultant", label: "Consultant" },
];

const FRIENDLY_ERRORS: Record<string, string> = {
  "announcement.invalid_schedule":
    "Expiry must be after the scheduled publish time.",
  "announcement.archived":
    "This announcement is archived and cannot be edited.",
};

function friendlyMsg(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? undefined;
}

/** Convert datetime-local string to full ISO 8601 UTC. */
function toISO(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Strip <p> tags back to newline-separated plain text for the edit textarea. */
function htmlToText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/g, "\n")
    .replace(/<\/?p>/g, "")
    .trim();
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

function formValuesToAudiences(values: AnnouncementFormValues): AudienceItem[] {
  const item: AudienceItem = { type: values.audienceType };
  if (values.departmentId) item.departmentId = values.departmentId;
  if (values.designationId) item.designationId = values.designationId;
  if (values.locationId) item.locationId = values.locationId;
  if (values.employmentType) item.employmentType = values.employmentType;
  if (values.employeeId) item.employeeId = values.employeeId;
  return [item];
}

export default function AdminAnnouncementDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: ann, isLoading, isError, refetch } = useAnnouncement(id);
  const { data: acksData, isLoading: acksLoading } = useAcknowledgements(id, {
    pageSize: 20,
  });
  const publish = usePublishAnnouncement();
  const archive = useArchiveAnnouncement();
  const restore = useRestoreAnnouncement();
  const update = useUpdateAnnouncement();
  const preview = usePreviewAudience();

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: emps } = useEmployees({ pageSize: 100 });

  const [editOpen, setEditOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    count: number;
    sample: { id: string; displayName: string; employeeCode: string }[];
  } | null>(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleValue, setScheduleValue] = useState("");

  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(AnnouncementSchema),
    defaultValues: {
      title: "",
      bodyHtml: "",
      priority: "normal",
      pinned: false,
      requiresAcknowledgment: false,
      scheduledFor: "",
      expiresAt: "",
      audienceType: "all_employees",
      departmentId: "",
      designationId: "",
      locationId: "",
      employeeId: "",
    },
  });

  const audienceType = form.watch("audienceType");

  // Populate form when opening edit sheet
  useEffect(() => {
    if (editOpen && ann) {
      const firstAud = ann.audiences[0];
      form.reset({
        title: ann.title,
        bodyHtml: htmlToText(ann.bodyHtml),
        priority: ann.priority,
        pinned: ann.pinned,
        requiresAcknowledgment: ann.requiresAcknowledgment,
        scheduledFor: ann.scheduledFor
          ? new Date(ann.scheduledFor).toISOString().slice(0, 16)
          : "",
        expiresAt: ann.expiresAt
          ? new Date(ann.expiresAt).toISOString().slice(0, 16)
          : "",
        audienceType: firstAud?.audienceType ?? "all_employees",
        departmentId: firstAud?.departmentId ?? "",
        designationId: firstAud?.designationId ?? "",
        locationId: firstAud?.locationId ?? "",
        employmentType:
          (firstAud?.employmentType as AnnouncementFormValues["employmentType"]) ??
          undefined,
        employeeId: firstAud?.employeeId ?? "",
      });
    }
  }, [editOpen, ann, form]);

  const doPreview = useCallback(
    async (values: AnnouncementFormValues) => {
      try {
        const result = await preview.mutateAsync({
          audiences: formValuesToAudiences(values),
        });
        setPreviewResult(result);
      } catch {
        setPreviewResult(null);
      }
    },
    [preview],
  );

  useEffect(() => {
    if (!editOpen) return;
    const sub = form.watch((values) => {
      const timer = setTimeout(
        () => void doPreview(values as AnnouncementFormValues),
        500,
      );
      return () => clearTimeout(timer);
    });
    return () => sub.unsubscribe();
  }, [form, doPreview, editOpen]);

  const handleSaveEdit = form.handleSubmit(async (values) => {
    if (!ann) return;
    try {
      await update.mutateAsync({
        id: ann.id,
        body: {
          title: values.title,
          // values.bodyHtml is plain text in the edit form — convert back to HTML
          bodyHtml: values.bodyHtml
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => `<p>${l}</p>`)
            .join(""),
          priority: values.priority,
          pinned: values.pinned,
          requiresAcknowledgment: values.requiresAcknowledgment,
          scheduledFor: toISO(values.scheduledFor),
          expiresAt: toISO(values.expiresAt),
          audiences: formValuesToAudiences(values),
        },
      });
      toast.success("Announcement updated");
      setEditOpen(false);
      refetch();
    } catch (err) {
      toast.error(
        friendlyMsg(err) ?? extractErrorMessage(err, "Failed to update"),
      );
    }
  });

  const handlePublishNow = async () => {
    if (!ann) return;
    try {
      await publish.mutateAsync({ id: ann.id });
      toast.success("Announcement published");
      refetch();
    } catch (err) {
      toast.error(
        friendlyMsg(err) ?? extractErrorMessage(err, "Failed to publish"),
      );
    }
  };

  const handleSchedule = async () => {
    if (!ann || !scheduleValue) return;
    try {
      await publish.mutateAsync({
        id: ann.id,
        scheduledFor: new Date(scheduleValue).toISOString(),
      });
      toast.success("Announcement scheduled");
      setScheduleMode(false);
      refetch();
    } catch (err) {
      toast.error(
        friendlyMsg(err) ?? extractErrorMessage(err, "Failed to schedule"),
      );
    }
  };

  /** Cancel a scheduled announcement — clears scheduledFor, drops status to draft. */
  const handleCancelSchedule = async () => {
    if (!ann) return;
    try {
      await update.mutateAsync({
        id: ann.id,
        body: { scheduledFor: null },
      });
      toast.success("Schedule cancelled — reverted to draft");
      refetch();
    } catch (err) {
      toast.error(
        friendlyMsg(err) ??
          extractErrorMessage(err, "Failed to cancel schedule"),
      );
    }
  };

  const handleArchive = async () => {
    if (!ann) return;
    try {
      await archive.mutateAsync(ann.id);
      toast.success("Announcement archived");
      router.push("/announcements");
    } catch (err) {
      toast.error(
        friendlyMsg(err) ?? extractErrorMessage(err, "Failed to archive"),
      );
    }
  };

  const [restoreOpen, setRestoreOpen] = useState(false);

  const handleRestore = async (): Promise<void> => {
    if (!ann) return;
    try {
      await restore.mutateAsync(ann.id);
      toast.success("Announcement restored to draft");
      setRestoreOpen(false);
    } catch (err) {
      toast.error(
        friendlyMsg(err) ?? extractErrorMessage(err, "Failed to restore"),
      );
      setRestoreOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !ann) {
    return (
      <div className="space-y-6">
        <PageHeader title="Announcement not found" />
        <EmptyState
          title="Could not load this announcement"
          description="It may have been deleted or you don't have access."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const canEdit = ann.status !== "archived";
  const canPublish = ann.status === "draft" || ann.status === "scheduled";
  const canArchive = ann.status !== "archived";
  const canRestore = ann.status === "archived";

  const FieldError = ({ name }: { name: keyof AnnouncementFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
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

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {ann.pinned ? (
              <Pin className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : null}
            <h1 className="text-xl font-semibold">{ann.title}</h1>
            <StatusBadge tone={STATUS_TONE[ann.status]}>
              {ann.status}
            </StatusBadge>
            <StatusBadge tone={PRIORITY_TONE[ann.priority]}>
              {ann.priority}
            </StatusBadge>
            {ann.requiresAcknowledgment ? (
              <Badge variant="outline">Requires ack</Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Created {fmtDateTime(ann.createdAt)}
            {ann.publishedAt
              ? ` · Published ${fmtDateTime(ann.publishedAt)}`
              : ""}
            {ann.scheduledFor
              ? ` · Scheduled ${fmtDateTime(ann.scheduledFor)}`
              : ""}
            {ann.expiresAt ? ` · Expires ${fmtDateTime(ann.expiresAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canEdit ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          ) : null}
          {canPublish && !scheduleMode ? (
            <>
              {ann.status === "scheduled" ? (
                <Button
                  variant="outline"
                  onClick={handleCancelSchedule}
                  disabled={update.isPending}
                >
                  {update.isPending ? "Cancelling…" : "Cancel schedule"}
                </Button>
              ) : null}
              <Button onClick={handlePublishNow} disabled={publish.isPending}>
                {publish.isPending ? "Publishing…" : "Publish now"}
              </Button>
              <Button variant="outline" onClick={() => setScheduleMode(true)}>
                Schedule
              </Button>
            </>
          ) : null}
          {scheduleMode ? (
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={scheduleValue}
                onChange={(e) => setScheduleValue(e.target.value)}
                className="w-44"
              />
              <Button
                size="sm"
                onClick={handleSchedule}
                disabled={!scheduleValue || publish.isPending}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setScheduleMode(false)}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          {canArchive ? (
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={archive.isPending}
            >
              {archive.isPending ? "Archiving…" : "Archive"}
            </Button>
          ) : null}
          {canRestore ? (
            <Button onClick={() => setRestoreOpen(true)}>
              Restore to draft
            </Button>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Content</h2>
        <div
          className="prose prose-sm max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: ann.bodyHtml }}
        />
      </div>

      {/* Audience */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Audience</h2>
        <ul className="space-y-1 text-sm">
          {ann.audiences.map((a) => (
            <li key={a.id} className="text-muted-foreground">
              {AUDIENCE_LABELS[a.audienceType] ?? a.audienceType}
              {a.departmentId ? ` · ${a.departmentId}` : ""}
              {a.designationId ? ` · ${a.designationId}` : ""}
              {a.locationId ? ` · ${a.locationId}` : ""}
              {a.employmentType ? ` · ${a.employmentType}` : ""}
              {a.employeeId ? ` · ${a.employeeId}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Total acknowledgements: {ann._count.acknowledgements}
        </p>
      </div>

      {/* Acknowledgements */}
      {ann.requiresAcknowledgment ? (
        <div className="rounded-lg border bg-card">
          <header className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">
              Acknowledgements ({ann._count.acknowledgements})
            </h2>
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
                    <th className="px-4 py-3 font-medium">Acknowledged at</th>
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
              <h2 className="text-lg font-semibold">Edit announcement</h2>
              <Separator />

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="e-title">Title</Label>
                  <Input id="e-title" {...form.register("title")} />
                  <FieldError name="title" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="e-body">Message</Label>
                  <textarea
                    id="e-body"
                    rows={8}
                    className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    {...form.register("bodyHtml")}
                  />
                  <FieldError name="bodyHtml" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="e-priority">Priority</Label>
                    <Select id="e-priority" {...form.register("priority")}>
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </Select>
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-sm pb-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        {...form.register("pinned")}
                      />
                      Pinned
                    </label>
                    <label className="flex items-center gap-2 text-sm pb-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        {...form.register("requiresAcknowledgment")}
                      />
                      Ack
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="e-scheduled">Schedule for</Label>
                    <Input
                      id="e-scheduled"
                      type="datetime-local"
                      {...form.register("scheduledFor")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="e-expires">Expires at</Label>
                    <Input
                      id="e-expires"
                      type="datetime-local"
                      {...form.register("expiresAt")}
                    />
                  </div>
                </div>

                <Separator />
                <h3 className="text-sm font-semibold">Audience</h3>

                <div className="space-y-1.5">
                  <Label htmlFor="e-aud-type">Target audience</Label>
                  <Select id="e-aud-type" {...form.register("audienceType")}>
                    {AUDIENCE_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>

                {audienceType === "department" ? (
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Select {...form.register("departmentId")}>
                      <option value="">Select…</option>
                      {(depts?.items ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : audienceType === "designation" ? (
                  <div className="space-y-1.5">
                    <Label>Designation</Label>
                    <Select {...form.register("designationId")}>
                      <option value="">Select…</option>
                      {(desigs?.items ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : audienceType === "location" ? (
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <Select {...form.register("locationId")}>
                      <option value="">Select…</option>
                      {(locs?.items ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : audienceType === "employment_type" ? (
                  <div className="space-y-1.5">
                    <Label>Employment type</Label>
                    <Select {...form.register("employmentType")}>
                      <option value="">Select…</option>
                      {EMPLOYMENT_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : audienceType === "specific_employees" ? (
                  <div className="space-y-1.5">
                    <Label>Employee</Label>
                    <Select {...form.register("employeeId")}>
                      <option value="">Select…</option>
                      {(emps?.items ?? []).map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.displayName} · {e.employeeCode}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}

                {previewResult ? (
                  <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-sm">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p>
                      Targeting {previewResult.count} employee
                      {previewResult.count !== 1 ? "s" : ""}
                      {previewResult.sample.length > 0
                        ? ` · ${previewResult.sample.map((s) => s.displayName).join(", ")}`
                        : ""}
                    </p>
                  </div>
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

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="Restore this announcement?"
        description="The announcement returns to draft. You can re-publish it from there. Acknowledgement history is preserved."
        confirmLabel="Restore to draft"
        pendingLabel="Restoring…"
        onConfirm={handleRestore}
      />
    </div>
  );
}
