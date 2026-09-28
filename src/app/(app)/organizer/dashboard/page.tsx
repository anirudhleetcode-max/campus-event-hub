import type { Metadata } from "next";
import Link from "next/link";
import {
  Award, Bell, CalendarCheck, CalendarDays, ClipboardList, Clock, IndianRupee, MessageSquareText, Plus, QrCode, Star, UserCheck,
} from "lucide-react";
import { can, staffEventScope } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { organizerOverview } from "@/server/services/analytics";
import { listNotifications } from "@/server/services/communications";
import { seatsTakenMap } from "@/server/services/events";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress, StatCard } from "@/components/ui/misc";
import { EventStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { formatAmount } from "@/components/organizer/format";
import { formatDate, formatNumber, formatPercent, formatTime, fromDateTimeLocal, relativeTime, toDateTimeLocal } from "@/lib/utils";
import { requireStaff } from "../_lib/guard";

export const metadata: Metadata = { title: "Organizer dashboard" };

const LIVE_STATUSES = ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"] as const;

async function loadDashboard(user: SessionUser) {
  const scope = staffEventScope(user);
  const now = new Date();
  const startOfToday = fromDateTimeLocal(`${toDateTimeLocal(now).slice(0, 10)}T00:00`) ?? now;
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000);

  const [overview, upcoming, recentRegistrations, today, pending, feedback, notifications] = await Promise.all([
    organizerOverview(user),
    db.event.findMany({
      where: { AND: [scope, { endsAt: { gte: now }, status: { notIn: ["CANCELLED", "ARCHIVED", "COMPLETED"] } }] },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, title: true, status: true, startsAt: true, capacity: true },
    }),
    db.registration.findMany({
      where: { event: scope },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, code: true, participantName: true, status: true, createdAt: true, event: { select: { id: true, title: true } } },
    }),
    db.event.findMany({
      where: { AND: [scope, { startsAt: { lt: endOfToday }, endsAt: { gte: startOfToday }, status: { in: [...LIVE_STATUSES] } }] },
      orderBy: { startsAt: "asc" },
      take: 6,
      select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
    }),
    db.event.findMany({
      where: { AND: [scope, { status: "PENDING_APPROVAL" }] },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: { id: true, title: true, startsAt: true, updatedAt: true, organizer: { select: { name: true } } },
    }),
    db.feedback.findMany({
      where: { event: scope, comments: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, overall: true, comments: true, createdAt: true, event: { select: { id: true, title: true } } },
    }),
    listNotifications(user, { take: 5 }),
  ]);

  const todayIds = today.map((e) => e.id);
  const [taken, todayRegs, todayAtt] = await Promise.all([
    seatsTakenMap(upcoming.map((e) => e.id)),
    todayIds.length ? db.registration.groupBy({ by: ["eventId"], where: { eventId: { in: todayIds }, status: "CONFIRMED" }, _count: { _all: true } }) : [],
    todayIds.length ? db.attendance.groupBy({ by: ["eventId"], where: { eventId: { in: todayIds } }, _count: { _all: true } }) : [],
  ]);
  const regMap = new Map(todayRegs.map((r) => [r.eventId, r._count._all]));
  const attMap = new Map(todayAtt.map((r) => [r.eventId, r._count._all]));

  return {
    overview,
    upcoming: upcoming.map((e) => ({ ...e, taken: taken.get(e.id) ?? 0 })),
    recentRegistrations,
    today: today.map((e) => ({ ...e, registered: regMap.get(e.id) ?? 0, checkedIn: attMap.get(e.id) ?? 0, live: e.startsAt <= now })),
    pending,
    feedback,
    notifications: notifications.items,
    now,
  };
}

export default async function OrganizerDashboardPage() {
  const user = await requireStaff();
  const d = await loadDashboard(user);
  const canCreate = can(user, "events:create");
  const isFaculty = user.role === "FACULTY_COORDINATOR";
  const liveTopics = d.upcoming.slice(0, 5).map((e) => `event:${e.id}:stats`);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description={isFaculty ? "Overview of the events you coordinate." : "Here's how your events are doing."}
        actions={
          <>
            {liveTopics.length > 0 && <LiveRefresh topics={liveTopics} />}
            {canCreate && (
              <Link href="/organizer/events/new" className={buttonClasses("primary")}>
                <Plus /> Create event
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total events" value={formatNumber(d.overview.totalEvents)} icon={CalendarDays} hint={d.overview.pendingApproval ? `${d.overview.pendingApproval} awaiting approval` : undefined} />
        <StatCard label="Active events" value={formatNumber(d.overview.activeEvents)} icon={CalendarCheck} />
        <StatCard label="Registrations" value={formatNumber(d.overview.registrations)} icon={ClipboardList} hint="Confirmed" />
        <StatCard label="Revenue" value={formatAmount(d.overview.revenue)} icon={IndianRupee} hint="Net of refunds" />
        <StatCard label="Attendance" value={formatNumber(d.overview.attendance)} icon={UserCheck} hint={d.overview.registrations ? `${formatPercent(d.overview.attendance / d.overview.registrations)} of registrations` : undefined} />
        <StatCard label="Certificates" value={formatNumber(d.overview.certificates)} icon={Award} hint="Issued" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>My upcoming events</CardTitle>
              <Link href="/organizer/events" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="No upcoming events"
                  description={canCreate ? "Create an event to start taking registrations." : "Upcoming events you're assigned to will show here."}
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {d.upcoming.map((e) => {
                    const fill = e.capacity ? e.taken / e.capacity : 0;
                    return (
                      <li key={e.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
                        <div className="min-w-0 flex-1">
                          <Link href={`/organizer/events/${e.id}`} className="line-clamp-1 font-medium hover:text-primary">
                            {e.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <EventStatusBadge status={e.status} />
                            <span>
                              {formatDate(e.startsAt, { weekday: "short", day: "numeric", month: "short" })} · {formatTime(e.startsAt)}
                            </span>
                          </div>
                        </div>
                        <div className="w-full sm:w-44">
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground tabular-nums">
                            <span>
                              {formatNumber(e.taken)} / {formatNumber(e.capacity)}
                            </span>
                            <span>{formatPercent(fill)}</span>
                          </div>
                          <Progress value={fill} tone={fill >= 1 ? "danger" : fill > 0.85 ? "warning" : "primary"} label={`${e.title} seats filled`} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent registrations</CardTitle>
              <Link href="/organizer/registrations" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.recentRegistrations.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No registrations yet" description="New registrations across your events will appear here." className="py-8" />
              ) : (
                <ul className="divide-y divide-border">
                  {d.recentRegistrations.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.participantName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <Link href={`/organizer/events/${r.event.id}/registrations`} className="hover:text-foreground">
                            {r.event.title}
                          </Link>{" "}
                          · {relativeTime(r.createdAt, d.now)}
                        </p>
                      </div>
                      <RegistrationStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Attendance today</CardTitle>
            </CardHeader>
            <CardContent>
              {d.today.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No events are running today.</p>
              ) : (
                <ul className="space-y-4">
                  {d.today.map((e) => (
                    <li key={e.id}>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/organizer/events/${e.id}/attendance`} className="line-clamp-1 text-sm font-medium hover:text-primary">
                          {e.title}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{e.live ? "Now" : formatTime(e.startsAt)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <Progress value={e.registered ? e.checkedIn / e.registered : 0} tone="success" label={`${e.title} check-ins`} />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatNumber(e.checkedIn)}/{formatNumber(e.registered)}
                        </span>
                      </div>
                      <Link href={`/organizer/events/${e.id}/scan`} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        <QrCode className="size-3.5" aria-hidden /> Open scanner
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending approvals</CardTitle>
            </CardHeader>
            <CardContent>
              {d.pending.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Nothing is waiting for approval.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.pending.map((e) => (
                    <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                      <Link href={`/organizer/events/${e.id}`} className="line-clamp-1 text-sm font-medium hover:text-primary">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {e.organizer.name} · submitted {relativeTime(e.updatedAt, d.now)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent feedback</CardTitle>
              <Link href="/organizer/feedback" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.feedback.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No feedback comments yet.</p>
              ) : (
                <ul className="space-y-4">
                  {d.feedback.map((f) => (
                    <li key={f.id} className="text-sm">
                      <div className="flex items-center gap-1 text-warning" aria-label={`${f.overall} out of 5 stars`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={i < f.overall ? "size-3.5 fill-current" : "size-3.5 text-border-strong"} aria-hidden />
                        ))}
                      </div>
                      <p className="mt-1 line-clamp-3 text-foreground">“{f.comments}”</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <Link href={`/organizer/events/${f.event.id}/feedback`} className="hover:text-foreground">
                          {f.event.title}
                        </Link>{" "}
                        · {relativeTime(f.createdAt, d.now)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Notifications</CardTitle>
              <Link href="/notifications" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.notifications.length === 0 ? (
                <EmptyState icon={Bell} title="You're all caught up" className="py-6" />
              ) : (
                <ul className="divide-y divide-border">
                  {d.notifications.map((n) => {
                    const body = (
                      <>
                        <p className="line-clamp-1 text-sm font-medium">
                          {!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-label="Unread" />}
                          {n.title}
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" aria-hidden /> {relativeTime(n.createdAt, d.now)}
                        </p>
                      </>
                    );
                    return (
                      <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                        {n.link ? (
                          <Link href={n.link} className="block rounded-md hover:bg-surface-2/60">
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {isFaculty && (
        <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquareText className="size-3.5" aria-hidden /> Faculty coordinators have read-only access. Contact the organizer to make changes.
        </p>
      )}
    </>
  );
}
