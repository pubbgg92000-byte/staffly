import type { Metadata } from "next";
import {
  PageHeader,
  WidgetCard,
  StatCard,
  EmptyState,
  Button,
} from "@staffly/ui";
import {
  CalendarDays,
  Megaphone,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard · Staffly" };

/**
 * E-DASH-001 placeholder. Sprint UI-1.3 swaps the static widget contents
 * for the live `GET /dashboard/employee` payload.
 */
export default function EmployeeDashboardPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <PageHeader title="Welcome back" subtitle="Your day at a glance" />
      <WidgetCard title="Today">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              You haven&apos;t checked in yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Expected window 09:00 – 18:00 · UI-1.3 wires real status
            </p>
          </div>
          <Button disabled className="w-full sm:w-auto">
            <Clock className="h-4 w-4" />
            Check in
          </Button>
        </div>
      </WidgetCard>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Pending acknowledgements"
          value="—"
          icon={<CheckCircle2 className="h-4 w-4" />}
          href="/me/announcements"
        />
        <StatCard
          label="Leave balance"
          value="—"
          icon={<CalendarDays className="h-4 w-4" />}
          href="/leave"
        />
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WidgetCard title="Recent announcements">
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="Wiring up in UI-1.3"
            description="Will list announcements published to you."
          />
        </WidgetCard>
        <WidgetCard title="Upcoming holidays">
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Wiring up in UI-1.3"
            description="Will list holidays from your calendar."
          />
        </WidgetCard>
      </section>
      <p className="text-xs text-muted-foreground">
        UI-1.1 Foundation · widgets render real data in UI-1.3.
      </p>
    </div>
  );
}
