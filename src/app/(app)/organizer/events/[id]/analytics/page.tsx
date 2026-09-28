import type { Metadata } from "next";
import { Award, ClipboardList, Download, Gauge, IndianRupee, Percent, Star, UserCheck, UserX } from "lucide-react";
import { eventAnalytics } from "@/server/services/analytics";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/misc";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { formatAmount } from "@/components/organizer/format";
import { formatNumber, formatPercent } from "@/lib/utils";
import { guarded, loadStaffEvent } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Event analytics" };

/** Check-in buckets are wall-clock hours in the app timezone, encoded as UTC timestamps. */
const hourLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export default async function EventAnalyticsPage({ params }: PageProps<"/organizer/events/[id]/analytics">) {
  const { id } = await params;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  if (!ev.data.access.canView) return <ForbiddenState message="Volunteers can only use the check-in scanner for this event." backHref={`/organizer/events/${id}/scan`} backLabel="Open scanner" />;
  const res = await guarded(() => eventAnalytics(user, id));
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const a = res.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Analytics</h2>
          <p className="text-sm text-muted-foreground">Registration, attendance and revenue performance for this event.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/exports/analytics?eventId=${id}`} className={buttonClasses("outline", "sm")} download>
            <Download /> Export CSV
          </a>
          <a href={`/api/events/${id}/report`} className={buttonClasses("outline", "sm")} download>
            <Download /> PDF report
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registrations" value={formatNumber(a.registrations)} icon={ClipboardList} hint={a.pending ? `${a.pending} awaiting payment` : `${a.cancelled} cancelled or expired`} />
        <StatCard label="Revenue" value={formatAmount(a.revenue)} icon={IndianRupee} hint={a.refunded ? `${formatAmount(a.refunded)} refunded` : `${formatNumber(a.paidCount)} payments`} />
        <StatCard label="Attendance" value={formatNumber(a.attendance)} icon={UserCheck} hint={`${formatPercent(a.attendanceRate)} of registrations`} />
        <StatCard label="Conversion rate" value={formatPercent(a.conversionRate)} icon={Percent} hint={`${formatNumber(a.attempts)} registration attempts`} />
        <StatCard label="No-show rate" value={a.noShowRate === null ? "—" : formatPercent(a.noShowRate)} icon={UserX} hint={a.noShowRate === null ? "Available once the event starts" : undefined} />
        <StatCard label="Feedback rating" value={a.feedbackAvg === null ? "—" : `${a.feedbackAvg.toFixed(1)} / 5`} icon={Star} hint={`${formatNumber(a.feedbackCount)} responses`} />
        <StatCard label="Certificates" value={formatNumber(a.certificates)} icon={Award} />
        <StatCard label="Fill rate" value={formatPercent(a.fillRate)} icon={Gauge} hint={`${formatNumber(a.registrations)} of ${formatNumber(a.capacity)} seats`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Registrations per day</CardTitle>
            <CardDescription>Confirmed registrations leading up to the event.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={a.timeline.map((t) => ({ date: t.date, value: t.value }))} valueLabel="Registrations" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Check-ins by hour</CardTitle>
            <CardDescription>When participants arrived.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={a.checkinsByHour.map((c) => ({ name: hourLabel(c.hour), value: c.value }))} emptyText="No check-ins recorded yet." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
