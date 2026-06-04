"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Input,
  Label,
  PageHeader,
  Select,
  extractErrorMessage,
  toast,
  useCreateAnnouncement,
  usePublishAnnouncement,
  usePreviewAudience,
  useDepartments,
  useDesignations,
  useLocations,
  useEmployees,
} from "@staffly/ui";
import {
  AnnouncementSchema,
  type AnnouncementFormValues,
  type AudienceItem,
} from "@staffly/types";
import { ArrowLeft, Users } from "lucide-react";

const FRIENDLY_ERRORS: Record<string, string> = {
  "announcement.invalid_schedule":
    "Expiry must be after the scheduled publish time.",
};

function friendlyMsg(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? code;
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

export default function NewAnnouncementPage(): React.ReactNode {
  const router = useRouter();
  const create = useCreateAnnouncement();
  const publish = usePublishAnnouncement();
  const preview = usePreviewAudience();

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: emps } = useEmployees({ pageSize: 100 });

  const [serverError, setServerError] = useState<string | undefined>();
  const [previewResult, setPreviewResult] = useState<{
    count: number;
    sample: { id: string; displayName: string; employeeCode: string }[];
  } | null>(null);

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
      employmentType: undefined,
      employeeId: "",
    },
  });

  const audienceType = form.watch("audienceType");

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

  // Debounced audience preview on form changes
  useEffect(() => {
    const sub = form.watch((values) => {
      const timer = setTimeout(() => {
        void doPreview(values as AnnouncementFormValues);
      }, 500);
      return () => clearTimeout(timer);
    });
    return () => sub.unsubscribe();
  }, [form, doPreview]);

  const handleSaveDraft = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const ann = await create.mutateAsync({
        title: values.title,
        bodyHtml: values.bodyHtml,
        priority: values.priority,
        pinned: values.pinned,
        requiresAcknowledgment: values.requiresAcknowledgment,
        scheduledFor: values.scheduledFor,
        expiresAt: values.expiresAt,
        audiences: formValuesToAudiences(values),
      });
      toast.success("Draft saved");
      router.push(`/announcements/${ann.id}`);
    } catch (err) {
      setServerError(
        friendlyMsg(
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : undefined,
        ) ?? extractErrorMessage(err, "Failed to save announcement"),
      );
    }
  });

  const handlePublishNow = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const ann = await create.mutateAsync({
        title: values.title,
        bodyHtml: values.bodyHtml,
        priority: values.priority,
        pinned: values.pinned,
        requiresAcknowledgment: values.requiresAcknowledgment,
        expiresAt: values.expiresAt,
        audiences: formValuesToAudiences(values),
      });
      await publish.mutateAsync({ id: ann.id });
      toast.success("Announcement published");
      router.push(`/announcements/${ann.id}`);
    } catch (err) {
      setServerError(
        friendlyMsg(
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : undefined,
        ) ?? extractErrorMessage(err, "Failed to publish announcement"),
      );
    }
  });

  const handleSchedule = form.handleSubmit(async (values) => {
    if (!values.scheduledFor) {
      form.setError("scheduledFor", {
        message: "Pick a schedule time to schedule this announcement",
      });
      return;
    }
    setServerError(undefined);
    try {
      const ann = await create.mutateAsync({
        title: values.title,
        bodyHtml: values.bodyHtml,
        priority: values.priority,
        pinned: values.pinned,
        requiresAcknowledgment: values.requiresAcknowledgment,
        expiresAt: values.expiresAt,
        audiences: formValuesToAudiences(values),
      });
      await publish.mutateAsync({
        id: ann.id,
        scheduledFor: values.scheduledFor,
      });
      toast.success("Announcement scheduled");
      router.push(`/announcements/${ann.id}`);
    } catch (err) {
      setServerError(
        friendlyMsg(
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : undefined,
        ) ?? extractErrorMessage(err, "Failed to schedule announcement"),
      );
    }
  });

  const isPending = create.isPending || publish.isPending;

  const FieldError = ({ name }: { name: keyof AnnouncementFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/announcements"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to announcements
      </Link>

      <PageHeader
        title="New announcement"
        subtitle="Draft and publish a message to your workforce"
      />

      {serverError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <div className="space-y-8">
        {/* Basic info */}
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Content</h2>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Announcement title…"
              {...form.register("title")}
            />
            <FieldError name="title" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bodyHtml">Body (HTML) *</Label>
            <textarea
              id="bodyHtml"
              rows={8}
              className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="<p>Your announcement content…</p>"
              {...form.register("bodyHtml")}
            />
            <FieldError name="bodyHtml" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" {...form.register("priority")}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </Select>
            </div>

            <div className="flex items-end gap-3">
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
                Requires ack
              </label>
            </div>
          </div>
        </section>

        {/* Scheduling */}
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Scheduling</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="scheduledFor">Schedule for (optional)</Label>
              <Input
                id="scheduledFor"
                type="datetime-local"
                {...form.register("scheduledFor")}
              />
              <FieldError name="scheduledFor" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiresAt">Expires at (optional)</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                {...form.register("expiresAt")}
              />
              <FieldError name="expiresAt" />
            </div>
          </div>
        </section>

        {/* Audience */}
        <section className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Audience</h2>

          <div className="space-y-1.5">
            <Label htmlFor="audienceType">Target audience</Label>
            <Select id="audienceType" {...form.register("audienceType")}>
              {AUDIENCE_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <FieldError name="audienceType" />
          </div>

          {audienceType === "department" ? (
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">Department</Label>
              <Select id="departmentId" {...form.register("departmentId")}>
                <option value="">Select…</option>
                {(depts?.items ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <FieldError name="departmentId" />
            </div>
          ) : audienceType === "designation" ? (
            <div className="space-y-1.5">
              <Label htmlFor="designationId">Designation</Label>
              <Select id="designationId" {...form.register("designationId")}>
                <option value="">Select…</option>
                {(desigs?.items ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <FieldError name="designationId" />
            </div>
          ) : audienceType === "location" ? (
            <div className="space-y-1.5">
              <Label htmlFor="locationId">Location</Label>
              <Select id="locationId" {...form.register("locationId")}>
                <option value="">Select…</option>
                {(locs?.items ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <FieldError name="locationId" />
            </div>
          ) : audienceType === "employment_type" ? (
            <div className="space-y-1.5">
              <Label htmlFor="employmentType">Employment type</Label>
              <Select id="employmentType" {...form.register("employmentType")}>
                <option value="">Select…</option>
                {EMPLOYMENT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <FieldError name="employmentType" />
            </div>
          ) : audienceType === "specific_employees" ? (
            <div className="space-y-1.5">
              <Label htmlFor="employeeId">Employee</Label>
              <Select id="employeeId" {...form.register("employeeId")}>
                <option value="">Select…</option>
                {(emps?.items ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayName} · {e.employeeCode}
                  </option>
                ))}
              </Select>
              <FieldError name="employeeId" />
            </div>
          ) : null}

          {/* Live preview */}
          {previewResult ? (
            <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-sm">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  Targeting {previewResult.count} employee
                  {previewResult.count !== 1 ? "s" : ""}
                </p>
                {previewResult.sample.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {previewResult.sample.map((s) => s.displayName).join(", ")}
                    {previewResult.count > previewResult.sample.length
                      ? ` +${previewResult.count - previewResult.sample.length} more`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isPending}
          >
            {create.isPending ? "Saving…" : "Save as draft"}
          </Button>
          <Button type="button" onClick={handlePublishNow} disabled={isPending}>
            {isPending ? "Please wait…" : "Publish now"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSchedule}
            disabled={isPending}
          >
            Schedule
          </Button>
        </div>
      </div>
    </div>
  );
}
