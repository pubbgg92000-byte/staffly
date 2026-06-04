"use client";

import { useState } from "react";
import {
  Button,
  EmptyState,
  PageHeader,
  StatusBadge,
  type StatusTone,
  WidgetCard,
  useMyHolidays,
} from "@staffly/ui";
import type { Holiday, HolidayType } from "@staffly/types";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { HolidayDetailDialog } from "./_components/holiday-detail-dialog";

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

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isoYear(year: number): { from: string; to: string } {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

function fmtShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupByMonth(holidays: Holiday[]): Map<number, Holiday[]> {
  const map = new Map<number, Holiday[]>();
  for (const h of holidays) {
    const month = new Date(h.date).getMonth();
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(h);
  }
  return map;
}

export default function EmployeeHolidaysPage(): React.ReactNode {
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { from, to } = isoYear(year);
  const { data, isLoading, isError, refetch } = useMyHolidays(from, to);

  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const holidays = data?.holidays ?? [];
  const hasNoCalendar = !isLoading && !isError && data?.calendarId === null;

  const upcoming = holidays.filter((h) => h.date >= today).slice(0, 5);

  const byMonth = groupByMonth(holidays);

  return (
    <div className="space-y-6">
      <PageHeader title="Holidays" subtitle="Your office calendar" />

      {/* Year navigator */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setYear((y) => y - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold tabular-nums">{year}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setYear((y) => y + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {hasNoCalendar ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="No calendar assigned"
          description="Your location hasn't been assigned a holiday calendar yet. Contact your HR administrator."
        />
      ) : (
        <>
          {/* Upcoming */}
          <WidgetCard
            title="Upcoming holidays"
            loading={isLoading}
            error={isError ? { message: "Failed to load holidays" } : null}
            onRetry={refetch}
            empty={
              !isLoading && upcoming.length === 0
                ? year === currentYear
                  ? "No upcoming holidays this year."
                  : "No holidays in this period."
                : undefined
            }
          >
            <ul className="divide-y">
              {upcoming.map((h) => (
                <li
                  key={h.id}
                  className="flex cursor-pointer items-center justify-between py-2 text-sm hover:opacity-80"
                  onClick={() => {
                    setSelectedHoliday(h);
                    setDetailOpen(true);
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtShortDate(h.date)}
                      {h.isOptional ? " · Optional" : ""}
                    </p>
                  </div>
                  <StatusBadge tone={TYPE_TONE[h.type]}>
                    {TYPE_LABEL[h.type]}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          </WidgetCard>

          {/* Full calendar — monthly groups */}
          {!isLoading && holidays.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold">All holidays {year}</h2>
              {MONTHS.map((monthName, idx) => {
                const monthHolidays = byMonth.get(idx);
                if (!monthHolidays?.length) return null;
                return (
                  <div
                    key={idx}
                    className="rounded-lg border bg-card overflow-hidden"
                  >
                    <div className="border-b bg-muted/40 px-4 py-2">
                      <h3 className="text-sm font-medium">
                        {monthName} {year}
                      </h3>
                    </div>
                    <ul className="divide-y">
                      {monthHolidays.map((h) => (
                        <li
                          key={h.id}
                          className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm hover:bg-accent/40"
                          onClick={() => {
                            setSelectedHoliday(h);
                            setDetailOpen(true);
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{h.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {fmtShortDate(h.date)}
                              {h.isOptional ? " · Optional" : ""}
                            </p>
                          </div>
                          <StatusBadge tone={TYPE_TONE[h.type]}>
                            {TYPE_LABEL[h.type]}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : !isLoading ? (
            <EmptyState
              icon={<CalendarDays className="h-8 w-8" />}
              title={`No holidays in ${year}`}
              description="Your calendar has no holidays recorded for this year."
            />
          ) : null}
        </>
      )}

      <HolidayDetailDialog
        holiday={selectedHoliday}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
