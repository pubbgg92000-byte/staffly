"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  extractErrorMessage,
  Input,
  Label,
  PageHeader,
  Select,
  toast,
  useCreateDocument,
  useDocumentCategories,
  useDocumentAudiencePreview,
  useDepartments,
  useDesignations,
  useLocations,
  useEmployees,
  uploadToPresignedUrl,
  usePresignUpload,
} from "@staffly/ui";
import {
  DocumentSchema,
  type DocumentFormValues,
  type DocumentAudienceType,
  type CreateDocumentInput,
} from "@staffly/types";
import { ArrowLeft, Upload, Users } from "lucide-react";

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

const MAX_BYTES = 100 * 1024 * 1024;

const FRIENDLY_ERRORS: Record<string, string> = {
  "document.category.not_found": "The selected category was not found.",
  "document.category.inactive": "The selected category is inactive.",
  "document.category_personal_mismatch":
    "The personal setting must match the category.",
};

function friendlyMsg(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? code;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAudiences(
  values: DocumentFormValues,
): NonNullable<CreateDocumentInput["audiences"]> {
  if (!values.audienceType) return [{ type: "all_employees" }];
  const item: NonNullable<CreateDocumentInput["audiences"]>[number] = {
    type: values.audienceType as DocumentAudienceType,
  };
  if (values.departmentId) item.departmentId = values.departmentId;
  if (values.designationId) item.designationId = values.designationId;
  if (values.locationId) item.locationId = values.locationId;
  if (values.employmentType) item.employmentType = values.employmentType;
  return [item];
}

export default function NewDocumentPage(): React.ReactNode {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();
  const [previewResult, setPreviewResult] = useState<{
    count: number;
    sample: { id: string; displayName: string }[];
  } | null>(null);

  const presign = usePresignUpload();
  const create = useCreateDocument();
  const audiencePreview = useDocumentAudiencePreview();

  const { data: categories } = useDocumentCategories({ pageSize: 100 });
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: emps } = useEmployees({ pageSize: 100 });

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(DocumentSchema),
    defaultValues: {
      categoryId: "",
      title: "",
      description: "",
      isRequired: false,
      dueBy: "",
      expiresAt: "",
      audienceType: "all_employees",
      departmentId: "",
      designationId: "",
      locationId: "",
      subjectEmployeeId: "",
      publishNow: false,
    },
  });

  const categoryId = form.watch("categoryId");
  const audienceType = form.watch("audienceType");

  const selectedCategory = categories?.items.find((c) => c.id === categoryId);
  const isPersonalCategory = selectedCategory?.isPersonal ?? false;

  const doPreview = useCallback(
    async (values: DocumentFormValues) => {
      if (isPersonalCategory) {
        setPreviewResult(null);
        return;
      }
      try {
        const result = await audiencePreview.mutateAsync({
          audiences: buildAudiences(values),
        });
        setPreviewResult(result);
      } catch {
        setPreviewResult(null);
      }
    },
    [audiencePreview, isPersonalCategory],
  );

  useEffect(() => {
    const sub = form.watch((values) => {
      const t = setTimeout(
        () => void doPreview(values as DocumentFormValues),
        500,
      );
      return () => clearTimeout(t);
    });
    return () => sub.unsubscribe();
  }, [form, doPreview]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("File too large. Maximum size is 100 MB.");
      return;
    }
    setSelectedFile(file);
    setUploadedKey(null);
    setIsUploading(true);
    try {
      const result = await presign.mutateAsync({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });
      await uploadToPresignedUrl(result.url, file);
      setUploadedKey(result.key);
      toast.success("File uploaded");
    } catch {
      toast.error("Upload failed. Please try again.");
      setSelectedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!selectedFile || !uploadedKey) {
      toast.error("Please select a file to upload.");
      return;
    }
    setServerError(undefined);
    try {
      const isPersonal = isPersonalCategory;
      const input: CreateDocumentInput = {
        categoryId: values.categoryId,
        title: values.title,
        description: values.description,
        isRequired: values.isRequired,
        dueBy: values.dueBy,
        expiresAt: values.expiresAt,
        isPersonal,
        file: {
          storageKey: uploadedKey,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          sizeBytes: selectedFile.size,
        },
        publishNow: values.publishNow,
      };
      if (isPersonal && values.subjectEmployeeId) {
        input.subjectEmployeeId = values.subjectEmployeeId;
      } else if (!isPersonal) {
        input.audiences = buildAudiences(values);
      }
      const doc = await create.mutateAsync(input);
      toast.success(values.publishNow ? "Document published" : "Draft saved");
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      setServerError(
        friendlyMsg(
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : undefined,
        ) ?? extractErrorMessage(err, "Failed to create document"),
      );
    }
  });

  const isPending = isUploading || create.isPending;

  const FieldError = ({ name }: { name: keyof DocumentFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href="/documents"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to documents
      </Link>

      <PageHeader
        title="Upload document"
        subtitle="Create a new document and assign it to employees"
      />

      {serverError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <div className="space-y-8">
        {/* Metadata */}
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold">Details</h2>

          <div className="space-y-1.5">
            <Label htmlFor="categoryId">Category *</Label>
            <Select id="categoryId" {...form.register("categoryId")}>
              <option value="">Select a category…</option>
              {(categories?.items ?? [])
                .filter((c) => c.isActive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
            <FieldError name="categoryId" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Document title…"
              {...form.register("title")}
            />
            <FieldError name="title" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <textarea
              id="description"
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              {...form.register("description")}
            />
            <FieldError name="description" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dueBy">Due by (optional)</Label>
              <Input id="dueBy" type="date" {...form.register("dueBy")} />
              <FieldError name="dueBy" />
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              {...form.register("isRequired")}
            />
            Requires acknowledgement
          </label>
        </section>

        {/* File upload */}
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold">File</h2>

          <div
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-muted/20 p-8 text-center transition-colors hover:bg-muted/40"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            {selectedFile ? (
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtSize(selectedFile.size)} ·{" "}
                  {uploadedKey
                    ? "Uploaded ✓"
                    : isUploading
                      ? "Uploading…"
                      : "Pending"}
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Click to select a file
                </p>
                <p className="text-xs text-muted-foreground">Max 100 MB</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </section>

        {/* Audience */}
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold">Audience</h2>

          {isPersonalCategory ? (
            <div className="space-y-1.5">
              <Label htmlFor="subjectEmployeeId">Employee</Label>
              <Select
                id="subjectEmployeeId"
                {...form.register("subjectEmployeeId")}
              >
                <option value="">Select employee…</option>
                {(emps?.items ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.displayName} · {e.employeeCode}
                  </option>
                ))}
              </Select>
              <FieldError name="subjectEmployeeId" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="audienceType">Target audience</Label>
                <Select id="audienceType" {...form.register("audienceType")}>
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
                  <Select {...form.register("subjectEmployeeId")}>
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
            </>
          )}
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              {...form.register("publishNow")}
            />
            Publish now
          </label>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/documents")}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !uploadedKey}
            >
              {isPending ? "Saving…" : "Save document"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
