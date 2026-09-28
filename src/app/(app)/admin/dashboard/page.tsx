import Link from "next/link";
import type { Metadata } from "next";
import { Award, CalendarCheck2, CalendarDays, IndianRupee, QrCode, Users, ClipboardCheck, ArrowRight, Download } from "lucide-react";
import { pageUser, sp, type SearchParams } from "@/server/page-guard";
import { dashboardAnalytics, resolveRange } from "@/server/services/analytics";
import { listAuditLogs } from "@/server/services/institutions";
import { staffEventScope } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { DownloadLink } from "@/components/ui/download-link";
import { UrlSelect, UrlDateInput } from "@/components/ui/url-controls";
import { TrendChart } from "@/components/charts/trend-chart";
import { BarList } from "@/components/charts/bar-list";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { formatDate, formatNumber, formatRupees, relativeTime } from "@/lib/utils";
import { RANGE_OPTIONS, rangeLabel } from "./range";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const range = resolveRange(sp(params, "range"), sp(params, "from"), sp(params, "to"));
  const [a, pending, logs] = await Promise.all([
    dashboardAnalytics(user, range),
    db.event.findMany({
      where: { AND: [staffEventScope(user), { status: "PENDING_APPROVAL" }] },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, title: true, startsAt: true, status: true, organizer: { select: { name: true } } },
    }),
    listAuditLogs(user, { pageSize: 8 }),
  ]);
  const t = a.totals;
  const exportHref = `/api/exports/analytics?range=${range.preset}${range.preset === "custom" ? `&from=${sp(params, "from")}&to=${sp(params, "to")}` : ""}`;

  return (
    <>
      <PageHeader
        title={user.role === "SUPER_ADMIN" ? "Platform overview" : `${user.collegeName ?? "College"} overview`}
        description={
          <span className="inline-flex flex-wrap items-center gap-3">
            {rangeLabel(range.preset)} · all figures computed live from the database
            <LiveRefresh topics={user.role === "SUPER_ADMIN" ? ["platform"] : [`college:${user.collegeId}`]} />
          </span>
        }
        actions={
          <>
            <UrlSelect param="range" label="Date range" options={RANGE_OPTIONS} allLabel={null} defaultValue="30d" />
            {range.preset === "custom" && (
              <>
                <UrlDateInput param="from" label="From date" />
                <UrlDateInput param="to" label="To date" />
              </>
            )}
            <DownloadLink href={exportHref} className={buttonClasses("outline", "md")}>
              <Download /> Export CSV
            </DownloadLink>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="Total users" value={formatNumber(t.users)} icon={Users} hint={user.role === "SUPER_ADMIN" ? "Across all colleges" : "In your college"} />
        <StatCard label="Total events" value={formatNumber(t.events)} icon={CalendarDays} hint={`${formatNumber(t.activeEvents)} active now`} />
        <StatCard label="Registrations" value={formatNumber(t.registrations)} icon={CalendarCheck2} hint="Confirmed in range" />
        <StatCard label="Revenue" value={formatRupees(t.revenue)} icon={IndianRupee} hint="Net of refunds" />
        <StatCard label="Attendance" value={formatNumber(t.attendance)} icon={QrCode} hint="Check-ins in range" />
        <StatCard label="Certificates" value={formatNumber(t.certificates)} icon={Award} hint="Issued in range" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Registration trend</CardTitle>
            <CardDescription>Confirmed registrations per {range.bucket}</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={a.registrationTrend} bucket={range.bucket} valueLabel="Registrations" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Popular events</CardTitle>
            <CardDescription>By registrations in range</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={a.popularEvents.map((e) => ({ name: e.title, value: e.registrations, href: `/organizer/events/${e.id}`, hint: `/ ${e.capacity}` }))} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Revenue trend</CardTitle>
            <CardDescription>Captured payments net of refunds</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={a.revenueTrend.map((p) => ({ ...p, value: Math.round(p.value / 100) }))} bucket={range.bucket} valueLabel="Revenue (₹)" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Department participation</CardTitle>
            <CardDescription>Registrations by department</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={a.departments} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Attendance trend</CardTitle>
            <CardDescription>QR and manual check-ins</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={a.attendanceTrend} bucket={range.bucket} valueLabel="Check-ins" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Event categories</CardTitle>
            <CardDescription>Registrations by category</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={a.categories.map((c) => ({ name: c.name, value: c.value }))} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Awaiting approval</CardTitle>
              <CardDescription>Events submitted by organizers</CardDescription>
            </div>
            <Link href="/admin/events?status=PENDING_APPROVAL" className={buttonClasses("ghost", "sm")}>
              View all <ArrowRight />
            </Link>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="All caught up" description="No events are waiting for your review." className="py-6" />
            ) : (
              <ul className="divide-y divide-border">
                {pending.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`/organizer/events/${e.id}`} className="block truncate font-medium hover:text-primary">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {e.organizer.name} · {formatDate(e.startsAt)}
                      </p>
                    </div>
                    <EventStatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>From the audit log</CardDescription>
            </div>
            <Link href="/admin/audit-logs" className={buttonClasses("ghost", "sm")}>
              Audit log <ArrowRight />
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {logs.items.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <p className="min-w-0">
                    <span className="font-medium">{l.actor?.name ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">{l.action.replace(/[._]/g, " ")}</span>
                  </p>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={l.createdAt.toISOString()}>
                    {relativeTime(l.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
            {logs.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
