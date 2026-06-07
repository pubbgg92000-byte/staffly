"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  extractErrorMessage,
  toast,
  useLogoUpload,
  useOrganization,
  usePermissionCheck,
  useUpdateOrganization,
} from "@staffly/ui";
import { ShieldOff, Upload } from "lucide-react";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const FRIENDLY: Record<string, string> = {
  "organization.not_found": "That organization no longer exists.",
  "organization.logo_key_invalid":
    "That logo upload reference is invalid. Please try uploading again.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? FRIENDLY[code] : undefined;
}

export default function BrandingPage(): React.ReactNode {
  const { has, isLoading: permsLoading } = usePermissionCheck();
  const canRead = has("org.settings.read");
  const canWrite = has("org.settings.write");

  const { data, isLoading, isError, error, refetch } = useOrganization();
  const update = useUpdateOrganization();
  const logoUpload = useLogoUpload();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [colorHex, setColorHex] = useState("#0F172A");
  const [colorError, setColorError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | undefined>();

  useEffect(() => {
    if (data) setColorHex(data.primaryColor);
  }, [data]);

  // The optimistic preview URL we created with createObjectURL needs to be
  // released; otherwise it pins the file blob in memory until reload.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (permsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!canRead) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the org.settings.read permission to view branding."
        />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Branding" />
        <EmptyState
          title="Failed to load organization"
          description={extractErrorMessage(error) ?? "Please try again."}
          action={
            <Button onClick={() => refetch()} variant="secondary">
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  async function handleFile(file: File | null): Promise<void> {
    if (!file) return;
    setServerError(undefined);
    if (!LOGO_MIME.has(file.type)) {
      setServerError("Logo must be a PNG, JPEG, WEBP, SVG or GIF.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setServerError("Logo must be 2 MB or smaller.");
      return;
    }
    // Optimistic preview so the user sees their pick before the round-trip.
    const next = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
    try {
      await logoUpload.upload(file);
      toast.success("Logo updated");
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err) ?? "Upload failed",
      );
    }
  }

  async function saveColor(): Promise<void> {
    setServerError(undefined);
    setColorError(undefined);
    if (!HEX_RE.test(colorHex)) {
      setColorError("Use a 6-digit hex like #1A2B3C.");
      return;
    }
    if (!data || colorHex === data.primaryColor) return;
    try {
      await update.mutateAsync({ primaryColor: colorHex });
      toast.success("Primary color updated");
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err) ?? "Update failed",
      );
    }
  }

  const displayedLogo = previewUrl ?? data?.logoUrl ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branding"
        subtitle="Logo and primary color shown across both portals."
      />

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            PNG, JPEG, WEBP, SVG, or GIF — up to 2 MB. Shown in the topbar and
            on invitation emails.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : displayedLogo ? (
              <img
                src={displayedLogo}
                alt="Organization logo"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={[...LOGO_MIME].join(",")}
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              disabled={!canWrite || logoUpload.isUploading}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!canWrite || logoUpload.isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {logoUpload.isUploading ? "Uploading…" : "Choose file"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Square images render best.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primary color</CardTitle>
          <CardDescription>
            6-digit hex (e.g. #1A2B3C). Stored now; runtime theming is rolling
            out in a later sprint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="colorPicker">Pick</Label>
              <input
                id="colorPicker"
                type="color"
                value={HEX_RE.test(colorHex) ? colorHex : "#0F172A"}
                disabled={!canWrite}
                onChange={(e) => setColorHex(e.target.value.toUpperCase())}
                className="h-10 w-16 cursor-pointer rounded border bg-background"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="colorHex">Hex</Label>
              <Input
                id="colorHex"
                value={colorHex}
                maxLength={7}
                disabled={!canWrite}
                onChange={(e) => setColorHex(e.target.value)}
                aria-invalid={colorError ? true : undefined}
              />
              {colorError ? (
                <p className="text-xs text-destructive">{colorError}</p>
              ) : null}
            </div>
            <div
              className="h-10 w-24 rounded border"
              style={{
                backgroundColor: HEX_RE.test(colorHex) ? colorHex : undefined,
              }}
              aria-hidden="true"
            />
            <Button
              type="button"
              onClick={() => void saveColor()}
              disabled={
                !canWrite ||
                update.isPending ||
                !HEX_RE.test(colorHex) ||
                colorHex === data?.primaryColor
              }
            >
              {update.isPending ? "Saving…" : "Save color"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {serverError ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}

      {!canWrite ? (
        <p className="text-sm text-muted-foreground">
          Read-only — you don&apos;t have org.settings.write.
        </p>
      ) : null}
    </div>
  );
}
