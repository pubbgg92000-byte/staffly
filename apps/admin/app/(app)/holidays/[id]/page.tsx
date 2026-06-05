"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useDeleteHoliday,
  useDeleteHolidayCalendar,
  useHolidayCalendar,
  useHolidaysInCalendar,
  useRestoreHolidayCalendar,
  useSetDefaultCalendar,
} from "@staffly/ui";
import type { Holiday, HolidayType } from "@staffly/types";
import {
  ArrowLeft,
  CalendarX,
  Pencil,
  PartyPopper,
  Plus,
  Star,
  Trash2,
  Undo2,
} from "lucide-react";
import { CalendarDialog } from "../_components/calendar-dialog";
import { HolidayDialog } from "../_components/holiday-dialog";
import { LocationAssignments } from "./_components/location-assignments";

const TYPE_TONE: Record<HolidayType, StatusTone> = {
  public: "info",
  restricted: "warning",
  optional: "muted",
  company: "success",
};

const TYPE_LABEL: Record<HolidayType, string> = {
  public: "Public",
  restricted: "Restricted",
  optional: "Optional",
  company: "Company",
};

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "public", label: "Public" },
  { value: "restricted", label: "Restricted" },
  { value: "optional", label: "Optional" },
  { value: "company", label: "Company" },
];

const FRIENDLY_ERRORS: Record<string, string> = {
  "holiday.calendar.default_required":
    "Cannot un-set the default calendar. Promote another calendar instead.",
  "holiday.calendar.default_undeletable":
    "The default calendar cannot be deleted. Promote another calendar first.",
};

function friendlyMsg(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? code;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HolidayCalendarDetailContent(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();

  const fromParam = sp.get("from") ?? "";
  const toParam = sp.get("to") ?? "";
  const typeParam = sp.get("type") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);
  const hasFilters = !!(fromParam || toParam || typeParam);

  const {
    data: calendar,
    isLoading: calLoading,
    isError: calError,
    refetch: calRefetch,
  } = useHolidayCalendar(id);

  // When filters are applied, use the paginated list endpoint; otherwise reuse
  // calendar.holidays from the detail response to avoid an extra round-trip.
  const filteredQuery = useHolidaysInCalendar(hasFilters ? id : undefined, {
    page: pageParam,
    pageSize: 20,
    from: fromParam || undefined,
    to: toParam || undefined,
    type: (typeParam as HolidayType) || undefined,
    sortDir: "asc",
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (
        updates.from !== undefined ||
        updates.to !== undefined ||
        updates.type !== undefined
      ) {
        next.delete("page");
      }
      router.push(`/holidays/${id}?${next.toString()}`);
    },
    [router, sp, id],
  );

  const [editCalOpen, setEditCalOpen] = useState(false);
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [deleteCalOpen, setDeleteCalOpen] = useState(false);
  const [restoreCalOpen, setRestoreCalOpen] = useState(false);
  const [deletingHoliday, setDeletingHoliday] = useState<Holiday | null>(null);

  const setDefault = useSetDefaultCalendar();
  const deleteCal = useDeleteHolidayCalendar();
  const restoreCal = useRestoreHolidayCalendar();
  const deleteHol = useDeleteHoliday();

  useEffect(() => {
    if (calError) {
      toast.error("Failed to load calendar", {
        action: { label: "Retry", onClick: calRefetch },
      });
    }
  }, [calError, calRefetch]);

  const holidays = useMemo<Holiday[]>(() => {
    if (hasFilters) return filteredQuery.data?.items ?? [];
    return calendar?.holidays ?? [];
  }, [hasFilters, filteredQuery.data, calendar]);

  const isLoading = calLoading || (hasFilters && filteredQuery.isLoading);
  const meta = hasFilters ? filteredQuery.data?.meta : undefined;
  const isEmpty = !isLoading && holidays.length === 0;

  const handleSetDefault = async () => {
    if (!calendar) return;
    try {
      await setDefault.mutateAsync(calendar.id);
      toast.success("Calendar set as default");
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      toast.error(friendlyMsg(code) ?? "Failed to set default");
    }
  };

  const handleDeleteCalendar = async () => {
    if (!calendar) return;
    try {
      await deleteCal.mutateAsync(calendar.id);
      toast.success("Calendar deleted");
      router.push("/holidays");
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      toast.error(friendlyMsg(code) ?? "Failed to delete calendar");
      setDeleteCalOpen(false);
    }
  };

  const handleRestoreCalendar = async (): Promise<void> => {
    if (!calendar) return;
    try {
      await restoreCal.mutateAsync(calendar.id);
      toast.success("Calendar restored");
      setRestoreCalOpen(false);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      toast.error(friendlyMsg(code) ?? "Failed to restore calendar");
      setRestoreCalOpen(false);
    }
  };

  const handleDeleteHoliday = async () => {
    if (!deletingHoliday) return;
    try {
      await deleteHol.mutateAsync(deletingHoliday.id);
      toast.success("Holiday deleted");
      setDeletingHoliday(null);
    } catch {
      toast.error("Failed to delete holiday");
    }
  };

  if (calLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (calError || !calendar) {
    return (
      <div className="space-y-6">
        <PageHeader title="Calendar not found" />
        <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-12 text-center">
          <CalendarX className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Could not load this calendar.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => calRefetch()}>
              Retry
            </Button>
            <Button variant="outline" asChild>
              <Link href="/holidays">Back to calendars</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/holidays"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to calendars
      </Link>

      {/* Calendar header */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{calendar.name}</h1>
            {calendar.deletedAt ? (
              <Badge variant="archived">Archived</Badge>
            ) : null}
            {calendar.isDefault ? (
              <Badge variant="success">Default</Badge>
            ) : null}
            {calendar.code ? (
              <Badge variant="outline">{calendar.code}</Badge>
            ) : null}
          </div>
          {calendar.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {calendar.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {calendar.deletedAt ? (
            <Button onClick={() => setRestoreCalOpen(true)}>
              <Undo2 className="h-4 w-4" />
              Restore
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditCalOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              {!calendar.isDefault ? (
                <Button
                  variant="outline"
                  onClick={handleSetDefault}
                  disabled={setDefault.isPending}
                >
                  <Star className="h-4 w-4" />
                  Set as default
                </Button>
              ) : null}
              {!calendar.isDefault ? (
                <Button
                  variant="destructive"
                  onClick={() => setDeleteCalOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Holidays section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Holidays</h2>
          <Button
            onClick={() => {
              setEditingHoliday(null);
              setHolidayDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add holiday
          </Button>
        </div>

        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={fromParam}
              onChange={(e) => updateParams({ from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={toParam}
              onChange={(e) => updateParams({ to: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select
              id="type"
              value={typeParam}
              onChange={(e) => updateParams({ type: e.target.value })}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Holidays table */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Optional
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Description
                </th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <Skeleton className="h-4 w-10" />
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <Skeleton className="h-4 w-64" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="ml-auto h-8 w-16" />
                      </td>
                    </tr>
                  ))
                : holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 tabular-nums">
                        {fmtDate(h.date)}
                      </td>
                      <td className="px-4 py-3 font-medium">{h.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={TYPE_TONE[h.type]}>
                          {TYPE_LABEL[h.type]}
                        </StatusBadge>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {h.isOptional ? (
                          <Badge variant="muted">Optional</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <p className="line-clamp-1 max-w-md text-muted-foreground">
                          {h.description ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingHoliday(h);
                              setHolidayDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingHoliday(h)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {isEmpty ? (
          <EmptyState
            icon={<PartyPopper className="h-8 w-8" />}
            title="No holidays"
            description={
              hasFilters
                ? "No holidays match these filters."
                : "Add your first holiday to this calendar."
            }
            action={
              !hasFilters ? (
                <Button
                  onClick={() => {
                    setEditingHoliday(null);
                    setHolidayDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add holiday
                </Button>
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
      </section>

      {/* Location assignments */}
      <LocationAssignments calendarId={calendar.id} />

      {/* Dialogs */}
      <CalendarDialog
        open={editCalOpen}
        onOpenChange={setEditCalOpen}
        calendar={calendar}
      />

      <HolidayDialog
        open={holidayDialogOpen}
        onOpenChange={(o) => {
          setHolidayDialogOpen(o);
          if (!o) setEditingHoliday(null);
        }}
        calendarId={calendar.id}
        holiday={editingHoliday}
      />

      {/* Delete-calendar confirmation */}
      <ConfirmDialog
        open={deleteCalOpen}
        onOpenChange={setDeleteCalOpen}
        tone="destructive"
        title="Delete this calendar?"
        description="This deletes the calendar and all its holidays. Locations using this calendar will need to be reassigned."
        confirmLabel="Delete calendar"
        pendingLabel="Deleting…"
        onConfirm={handleDeleteCalendar}
      />

      {/* Restore-calendar confirmation */}
      <ConfirmDialog
        open={restoreCalOpen}
        onOpenChange={setRestoreCalOpen}
        title="Restore this calendar?"
        description="The calendar reappears in the list. Existing location assignments still reference it."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={handleRestoreCalendar}
      />

      {/* Delete-holiday confirmation */}
      <ConfirmDialog
        open={!!deletingHoliday}
        onOpenChange={(o) => !o && setDeletingHoliday(null)}
        tone="destructive"
        title="Delete this holiday?"
        description={
          deletingHoliday
            ? `${deletingHoliday.name} on ${fmtDate(deletingHoliday.date)} will be removed.`
            : undefined
        }
        confirmLabel="Delete holiday"
        pendingLabel="Deleting…"
        onConfirm={handleDeleteHoliday}
      />
    </div>
  );
}

export default function AdminHolidayCalendarDetailPage(): React.ReactNode {
  return (
    <Suspense>
      <HolidayCalendarDetailContent />
    </Suspense>
  );
}
