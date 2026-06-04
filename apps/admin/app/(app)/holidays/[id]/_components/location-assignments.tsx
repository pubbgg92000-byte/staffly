"use client";

import { useMemo } from "react";
import {
  Button,
  Skeleton,
  StatusBadge,
  toast,
  useAssignLocationCalendar,
  useLocationCalendar,
  useLocations,
  useUnassignLocationCalendar,
} from "@staffly/ui";
import type { LocationCalendarAssignment } from "@staffly/types";

function LocationRow({
  locationId,
  locationName,
  thisCalendarId,
}: {
  locationId: string;
  locationName: string;
  thisCalendarId: string;
}): React.ReactNode {
  const { data: assignment, isLoading } = useLocationCalendar(locationId);
  const assign = useAssignLocationCalendar();
  const unassign = useUnassignLocationCalendar();
  const assigned =
    (assignment as LocationCalendarAssignment | null | undefined)?.calendar
      .id === thisCalendarId;

  const handleAssign = async () => {
    try {
      await assign.mutateAsync({ locationId, calendarId: thisCalendarId });
      toast.success(`Assigned to ${locationName}`);
    } catch {
      toast.error("Failed to assign calendar");
    }
  };

  const handleUnassign = async () => {
    try {
      await unassign.mutateAsync(locationId);
      toast.success(`Unassigned from ${locationName}`);
    } catch {
      toast.error("Failed to unassign calendar");
    }
  };

  const current = assignment as LocationCalendarAssignment | null | undefined;

  return (
    <tr className="hover:bg-accent/40">
      <td className="px-4 py-3 font-medium">{locationName}</td>
      <td className="px-4 py-3">
        {isLoading ? (
          <Skeleton className="h-4 w-24" />
        ) : assigned ? (
          <StatusBadge tone="success">This calendar</StatusBadge>
        ) : current?.calendar ? (
          <span className="text-muted-foreground">{current.calendar.name}</span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {assigned ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnassign}
            disabled={unassign.isPending}
          >
            {unassign.isPending ? "Removing…" : "Unassign"}
          </Button>
        ) : (
          <Button size="sm" onClick={handleAssign} disabled={assign.isPending}>
            {assign.isPending ? "Assigning…" : "Assign here"}
          </Button>
        )}
      </td>
    </tr>
  );
}

export function LocationAssignments({
  calendarId,
}: {
  calendarId: string;
}): React.ReactNode {
  const { data: locations, isLoading } = useLocations();
  const locItems = useMemo(() => locations?.items ?? [], [locations]);

  return (
    <div className="rounded-lg border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Location assignments</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Assign this calendar to one or more locations.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2 p-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : locItems.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          Your organization has no locations yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Current assignment</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {locItems.map((loc) => (
                <LocationRow
                  key={loc.id}
                  locationId={loc.id}
                  locationName={loc.name}
                  thisCalendarId={calendarId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
