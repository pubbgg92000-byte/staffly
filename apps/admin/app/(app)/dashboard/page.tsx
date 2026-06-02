import type { Metadata } from "next";
import { PageHeader, WidgetCard, StatCard, EmptyState } from "@staffly/ui";
import {
  Users,
  Clock,
  Inbox,
  CalendarDays,
  Megaphone,
  Sparkles,
} from "lucide-react";

export const metadata: Metadata = { title: "Dashboard · Staffly Admin" };

/**
 * A-DASH-001 placeholder. Sprint UI-1.3 swaps the static widget contents
 * for the live `GET /dashboard/admin` payload.
 */
export default function AdminDashboardPage(): React.ReactNode {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Snapshot of your organization" />
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total employees"
          value="—"
          icon={<Users className="h-4 w-4" />}
          href="/employees"
        />
        <StatCard
          label="Present today"
          value="—"
          icon={<Clock className="h-4 w-4" />}
          href="/attendance"
        />
        <StatCard
          label="Pending approvals"
          value="—"
          icon={<Inbox className="h-4 w-4" />}
          href="/leave/requests?status=pending"
        />
        <StatCard
          label="Published announcements"
          value="—"
          icon={<Megaphone className="h-4 w-4" />}
          href="/announcements"
        />
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WidgetCard title="Upcoming holidays">
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="Wiring up in UI-1.3"
            description="Will list the next 5 holidays from /dashboard/admin."
          />
        </WidgetCard>
        <WidgetCard title="Recent announcements">
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="Wiring up in UI-1.3"
            description="Will list the 5 most recently published announcements."
          />
        </WidgetCard>
        <WidgetCard title="New hires">
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Wiring up in UI-1.3"
            description="Will list employees added in the last 30 days."
          />
        </WidgetCard>
      </section>
      <p className="text-xs text-muted-foreground">
        UI-1.1 Foundation · widgets render real data in UI-1.3.
      </p>
    </div>
  );
}
