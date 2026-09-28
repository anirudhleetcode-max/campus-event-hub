import { Award, CalendarCheck, CalendarDays, ClipboardList, Download, IndianRupee, UserCheck, Users } from "lucide-react";
import type { DashboardAnalytics } from "@/server/services/analytics";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/misc";
import { UrlDateInput, UrlSelect } from "@/components/ui/url-controls";
import { BarList } from "@/components/charts/bar-list";
import { TrendChart } from "@/components/charts/trend-chart";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";
import { formatAmount } from "./format";

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

/**
 * Multi-event analytics dashboard (range filter, KPI cards, trends, rankings).
 * Shared by /organizer/analytics and /admin/analytics — it only renders the
 * `DashboardAnalytics` object, which the service already scopes to the viewer.
 */
export function AnalyticsView({
  data,
  exportHref,
  showUsers = false,
  eventBasePath = "/organizer/events",
}: {
  data: DashboardAnalytics;
  /** CSV export URL for the current range (e.g. /api/exports/analytics?range=30d). */
  exportHref?: string;
  /** Show the user-count card (admin dashboards). */
  showUsers?: boolean;
  eventBasePath?: string;
}) {
  const { totals, range } = data;
  const bucket = range.bucket as "day" | "month";
  const bucketLabel = bucket === "month" ? "per month" : "per day";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <UrlSelect param="range" label="Date range" options={RANGE_OPTIONS} allLabel="Last 30 days" />
          {range.preset === "custom" && (
            <>
              <UrlDateInput param="from" label="From date" />
              <span className="text-sm text-muted-foreground">to</span>
              <UrlDateInput param="to" label="To date" />
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {formatDate(range.from, { day: "numeric", month: "short", year: "numeric" })} – {formatDate(range.to, { day: "numeric", month: "short", year: "numeric" })}
          </p>
          {exportHref && (
            <a href={exportHref} className={buttonClasses("outline", "sm")} download>
              <Download /> Export CSV
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showUsers && <StatCard label="Users" value={formatNumber(totals.users)} icon={Users} />}
        <StatCard label="Events" value={formatNumber(totals.events)} icon={CalendarDays} hint={`${formatNumber(totals.activeEvents)} active now`} />
        <StatCard label="Registrations" value={formatNumber(totals.registrations)} icon={ClipboardList} hint="Confirmed in this period" />
        <StatCard label="Revenue" value={formatAmount(totals.revenue)} icon={IndianRupee} hint="Net of refunds" />
        <StatCard
          label="Attendance"
          value={formatNumber(totals.attendance)}
          icon={UserCheck}
          hint={totals.registrations ? `${formatPercent(Math.min(1, totals.attendance / totals.registrations))} of registrations` : "Check-ins in this period"}
        />
        <StatCard label="Certificates" value={formatNumber(totals.certificates)} icon={Award} hint="Issued in this period" />
        {!showUsers && <StatCard label="Active events" value={formatNumber(totals.activeEvents)} icon={CalendarCheck} hint="Published, open or ongoing" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Registrations</CardTitle>
            <CardDescription>Confirmed registrations {bucketLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.registrationTrend} bucket={bucket} valueLabel="Registrations" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Net revenue in rupees {bucketLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.revenueTrend.map((p) => ({ date: p.date, value: Math.round(p.value) / 100 }))} bucket={bucket} valueLabel="Revenue (₹)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>Check-ins {bucketLabel}.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={data.attendanceTrend} bucket={bucket} valueLabel="Check-ins" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Popular events</CardTitle>
            <CardDescription>By confirmed registrations.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={data.popularEvents.map((e) => ({ name: e.title, value: e.registrations, href: `${eventBasePath}/${e.id}`, hint: `/ ${formatNumber(e.capacity)}` }))}
              emptyText="No registrations in this period."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
            <CardDescription>Where participants come from.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={data.departments} emptyText="No registrations in this period." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>Registrations by event category.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={data.categories.map((c) => ({ name: c.name, value: c.value }))} emptyText="No registrations in this period." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
