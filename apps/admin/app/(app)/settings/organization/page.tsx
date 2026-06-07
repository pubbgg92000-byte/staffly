"use client";

import { useEffect, useMemo, useState } from "react";
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
  Select,
  Skeleton,
  extractErrorMessage,
  toast,
  useOrganization,
  usePermissionCheck,
  useUpdateOrganization,
} from "@staffly/ui";
import type { UpdateOrganizationInput } from "@staffly/types";
import { ShieldOff } from "lucide-react";

const FRIENDLY: Record<string, string> = {
  "organization.not_found": "That organization no longer exists.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? FRIENDLY[code] : undefined;
}

/**
 * `Intl.supportedValuesOf` is widely available in modern Chromium/Firefox/Safari
 * but TypeScript still ships it as an optional API. Coerce once and cache.
 */
function listTimezones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone" | "currency") => string[];
  };
  return intl.supportedValuesOf?.("timeZone") ?? ["Etc/UTC"];
}
function listCurrencies(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone" | "currency") => string[];
  };
  return intl.supportedValuesOf?.("currency") ?? ["USD", "EUR", "GBP"];
}

interface FormState {
  name: string;
  legalName: string;
  domain: string;
  billingEmail: string;
  timezone: string;
  locale: string;
  currency: string;
  weekStart: number;
}

const EMPTY: FormState = {
  name: "",
  legalName: "",
  domain: "",
  billingEmail: "",
  timezone: "Etc/UTC",
  locale: "en-US",
  currency: "USD",
  weekStart: 1,
};

export default function OrganizationSettingsPage(): React.ReactNode {
  const { has, isLoading: permsLoading } = usePermissionCheck();
  const canRead = has("org.settings.read");
  const canWrite = has("org.settings.write");

  const { data, isLoading, isError, error, refetch } = useOrganization();
  const update = useUpdateOrganization();

  const timezones = useMemo(listTimezones, []);
  const currencies = useMemo(listCurrencies, []);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [serverError, setServerError] = useState<string | undefined>();

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        legalName: data.legalName ?? "",
        domain: data.domain ?? "",
        billingEmail: data.billingEmail ?? "",
        timezone: data.timezone,
        locale: data.locale,
        currency: data.currency,
        weekStart: data.weekStart,
      });
    }
  }, [data]);

  if (permsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!canRead) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the org.settings.read permission to view organization settings."
        />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Organization" />
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

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setServerError(undefined);
    if (!data) return;

    // Only send fields that changed AND are non-empty (or explicitly cleared
    // for nullable fields). Keeps the audit log payload tight.
    const patch: UpdateOrganizationInput = {};
    if (form.name && form.name !== data.name) patch.name = form.name.trim();
    if (form.legalName !== (data.legalName ?? "")) {
      patch.legalName = form.legalName.trim() || null;
    }
    if (form.domain !== (data.domain ?? "")) {
      patch.domain = form.domain.trim() || null;
    }
    if (form.billingEmail !== (data.billingEmail ?? "")) {
      patch.billingEmail = form.billingEmail.trim() || null;
    }
    if (form.timezone !== data.timezone) patch.timezone = form.timezone;
    if (form.locale !== data.locale) patch.locale = form.locale.trim();
    if (form.currency !== data.currency) patch.currency = form.currency;
    if (form.weekStart !== data.weekStart) patch.weekStart = form.weekStart;

    if (Object.keys(patch).length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await update.mutateAsync(patch);
      toast.success("Organization updated");
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err) ?? "Update failed",
      );
    }
  }

  const isDirty = Boolean(
    data &&
    (form.name.trim() !== data.name ||
      form.legalName !== (data.legalName ?? "") ||
      form.domain !== (data.domain ?? "") ||
      form.billingEmail !== (data.billingEmail ?? "") ||
      form.timezone !== data.timezone ||
      form.locale !== data.locale ||
      form.currency !== data.currency ||
      form.weekStart !== data.weekStart),
  );

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <PageHeader
        title="Organization"
        subtitle="Company profile, contact, and localization defaults."
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            How your organization appears across the product and to your people.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Organization name"
            required
            loading={isLoading}
            id="name"
          >
            <Input
              id="name"
              value={form.name}
              maxLength={120}
              required
              disabled={!canWrite}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Legal name" loading={isLoading} id="legalName">
            <Input
              id="legalName"
              value={form.legalName}
              maxLength={180}
              disabled={!canWrite}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            />
          </Field>
          <Field label="Primary domain" loading={isLoading} id="domain">
            <Input
              id="domain"
              value={form.domain}
              maxLength={180}
              placeholder="acme.com"
              disabled={!canWrite}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
            />
          </Field>
          <Field label="Billing email" loading={isLoading} id="billingEmail">
            <Input
              id="billingEmail"
              type="email"
              value={form.billingEmail}
              maxLength={254}
              disabled={!canWrite}
              onChange={(e) =>
                setForm({ ...form, billingEmail: e.target.value })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Localization</CardTitle>
          <CardDescription>
            Defaults applied across calendars, payroll, and timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Time zone" loading={isLoading} id="timezone">
            <Select
              id="timezone"
              value={form.timezone}
              disabled={!canWrite}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Locale (BCP-47)" loading={isLoading} id="locale">
            <Input
              id="locale"
              value={form.locale}
              maxLength={16}
              placeholder="en-US"
              disabled={!canWrite}
              onChange={(e) => setForm({ ...form, locale: e.target.value })}
            />
          </Field>
          <Field label="Currency" loading={isLoading} id="currency">
            <Select
              id="currency"
              value={form.currency}
              disabled={!canWrite}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Week starts on" loading={isLoading} id="weekStart">
            <Select
              id="weekStart"
              value={String(form.weekStart)}
              disabled={!canWrite}
              onChange={(e) =>
                setForm({ ...form, weekStart: Number(e.target.value) })
              }
            >
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="6">Saturday</option>
            </Select>
          </Field>
        </CardContent>
      </Card>

      {serverError ? (
        <p className="text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {!canWrite ? (
          <p className="text-sm text-muted-foreground">
            Read-only — you don&apos;t have org.settings.write.
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={!canWrite || !isDirty || update.isPending}
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  loading,
  id,
  children,
}: {
  label: string;
  required?: boolean;
  loading?: boolean;
  id: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {loading ? <Skeleton className="h-10 w-full" /> : children}
    </div>
  );
}
