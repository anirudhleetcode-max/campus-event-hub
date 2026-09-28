import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, Award, BadgeCheck, Bell, CalendarCheck2, CalendarClock, CalendarDays, CheckCircle2, CreditCard, Download, MapPin, MessageSquareText, QrCode, RotateCcw, Search, Ticket, XCircle, type LucideIcon,
} from "lucide-react";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { listNotifications } from "@/server/services/communications";
import { listPublicEvents, type PublicEventCard } from "@/server/services/events";
import { homeFor } from "@/components/layout/nav-config";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader, SectionTitle, StatCard } from "@/components/ui/misc";
import { RegistrationStatusBadge } from "@/components/ui/status-badges";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { EventCard } from "@/components/events/event-card";
import { CERTIFICATE_TYPE, EVENT_MODE } from "@/lib/labels";
import { cn, formatDate, formatDateRange, formatMoney, formatNumber, formatTime, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const eventSelect = { id: true, slug: true, title: true, startsAt: true, endsAt: true, venueName: true, city: true, mode: true, status: true } as const;

async function loadDashboard(user: SessionUser) {
  const now = new Date();
  const userId = user.id;
  const [
    registeredCount, upcomingCount, attendedCount, certificateCount,
    upcoming, pending, recent, certificates, feedbackDue, notifications, profile,
    actRegs, actAttendance, actCerts, actPayments,
  ] = await Promise.all([
    db.registration.count({ where: { userId, status: "CONFIRMED" } }),
    db.registration.count({ where: { userId, status: "CONFIRMED", event: { endsAt: { gte: now }, status: { not: "CANCELLED" } } } }),
    db.attendance.count({ where: { userId } }),
    db.certificate.count({ where: { userId, status: "ISSUED" } }),
    db.registration.findMany({
      where: { userId, status: "CONFIRMED", event: { endsAt: { gte: now }, status: { not: "CANCELLED" } } },
      orderBy: { event: { startsAt: "asc" } },
      take: 3,
      select: { id: true, code: true, event: { select: eventSelect } },
    }),
    db.registration.findMany({
      where: { userId, status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } },
      orderBy: { holdExpiresAt: "asc" },
      take: 3,
      select: { id: true, amount: true, holdExpiresAt: true, event: { select: { title: true, currency: true } } },
    }),
    db.registration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, createdAt: true, event: { select: { title: true, startsAt: true } } },
    }),
    db.certificate.findMany({
      where: { userId, status: "ISSUED" },
      orderBy: { issuedAt: "desc" },
      take: 3,
      select: { id: true, code: true, type: true, issuedAt: true, event: { select: { title: true } } },
    }),
    db.registration.findMany({
      where: {
        userId, status: "CONFIRMED", feedback: { is: null },
        event: { status: { not: "CANCELLED" }, OR: [{ endsAt: { lt: now } }, { status: "COMPLETED" }] },
      },
      orderBy: { event: { endsAt: "desc" } },
      take: 3,
      select: { id: true, event: { select: { title: true, endsAt: true } } },
    }),
    listNotifications(user, { take: 5 }),
    db.user.findUnique({ where: { id: userId }, select: { interests: true } }),
    db.registration.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, status: true, createdAt: true, confirmedAt: true, cancelledAt: true, amount: true, event: { select: { title: true } } },
    }),
    db.attendance.findMany({
      where: { userId },
      orderBy: { checkInAt: "desc" },
      take: 5,
      select: { id: true, checkInAt: true, registrationId: true, event: { select: { title: true } } },
    }),
    db.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
      take: 5,
      select: { id: true, type: true, issuedAt: true, event: { select: { title: true } } },
    }),
    db.payment.findMany({
      where: { userId, status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, status: true, amount: true, currency: true, paidAt: true, refundedAt: true, refundAmount: true, updatedAt: true, event: { select: { title: true } } },
    }),
  ]);

  // ─ Recent activity: one merged, time-ordered timeline ─
  type Activity = { key: string; at: Date; icon: LucideIcon; tone: string; text: string; href: string };
  const activity: Activity[] = [];
  for (const r of actRegs) {
    activity.push({ key: `reg-${r.id}`, at: r.createdAt, icon: Ticket, tone: "bg-primary-soft text-primary-soft-foreground", text: `Registered for ${r.event.title}`, href: `/my/registrations/${r.id}` });
    if (r.confirmedAt && r.amount > 0) activity.push({ key: `conf-${r.id}`, at: r.confirmedAt, icon: BadgeCheck, tone: "bg-success-soft text-success-soft-foreground", text: `Registration confirmed for ${r.event.title}`, href: `/my/registrations/${r.id}` });
    if (r.status === "CANCELLED" && r.cancelledAt) activity.push({ key: `can-${r.id}`, at: r.cancelledAt, icon: XCircle, tone: "bg-danger-soft text-danger-soft-foreground", text: `Registration cancelled for ${r.event.title}`, href: `/my/registrations/${r.id}` });
  }
  for (const a of actAttendance) activity.push({ key: `att-${a.id}`, at: a.checkInAt, icon: CheckCircle2, tone: "bg-success-soft text-success-soft-foreground", text: `Checked in at ${a.event.title}`, href: `/my/registrations/${a.registrationId}` });
  for (const c of actCerts) activity.push({ key: `cert-${c.id}`, at: c.issuedAt, icon: Award, tone: "bg-accent-soft text-accent-soft-foreground", text: `${CERTIFICATE_TYPE[c.type]} certificate issued for ${c.event.title}`, href: "/my/certificates" });
  for (const p of actPayments) {
    if (p.status === "FAILED") activity.push({ key: `payf-${p.id}`, at: p.updatedAt, icon: XCircle, tone: "bg-danger-soft text-danger-soft-foreground", text: `Payment failed for ${p.event.title}`, href: `/my/payments/${p.id}` });
    else if (p.paidAt) activity.push({ key: `pay-${p.id}`, at: p.paidAt, icon: CreditCard, tone: "bg-success-soft text-success-soft-foreground", text: `Paid ${formatMoney(p.amount, p.currency)} for ${p.event.title}`, href: `/my/payments/${p.id}` });
    if (p.refundedAt) activity.push({ key: `ref-${p.id}`, at: p.refundedAt, icon: RotateCcw, tone: "bg-info-soft text-info-soft-foreground", text: `Refund of ${formatMoney(p.refundAmount, p.currency)} for ${p.event.title}`, href: `/my/payments/${p.id}` });
  }
  activity.sort((a, b) => b.at.getTime() - a.at.getTime());

  // ─ Recommendations: upcoming open events, ranked by college + interest match ─
  const registeredEventIds = new Set(
    (await db.registration.findMany({ where: { userId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } }, select: { eventId: true }, take: 500 })).map((r) => r.eventId),
  );
  const { items: candidates } = await listPublicEvents({ when: "upcoming", sort: "soonest", pageSize: 36 });
  const interests = (profile?.interests ?? []).map((i) => i.toLowerCase());
  const score = (e: PublicEventCard) => {
    const hay = `${e.title} ${e.summary} ${e.category.name} ${e.category.slug}`.toLowerCase();
    return (user.collegeName && e.college.name === user.collegeName ? 2 : 0) + interests.filter((i) => hay.includes(i)).length * 3;
  };
  const recommended = candidates
    .filter((e) => !registeredEventIds.has(e.id) && e.status !== "CANCELLED" && (e.status === "REGISTRATION_OPEN" || e.status === "PUBLISHED"))
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.startsAt.getTime() - b.e.startsAt.getTime())
    .slice(0, 3)
    .map((x) => x.e);

  return {
    stats: { registeredCount, upcomingCount, attendedCount, certificateCount },
    upcoming, pending, recent, certificates, feedbackDue, notifications, activity: activity.slice(0, 8), recommended,
    hour: Number(formatDate(now, { hour: "numeric", hourCycle: "h23" })),
  };
}

export default async function StudentDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect(homeFor(user.role));
  const d = await loadDashboard(user);
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const greeting = d.hour < 12 ? "Good morning" : d.hour < 17 ? "Good afternoon" : "Good evening";
  const nextPass = d.upcoming[0];

  const quickActions = [
    { href: "/events", label: "Explore events", icon: Search },
    ...(nextPass ? [{ href: `/my/registrations/${nextPass.id}`, label: "View QR pass", icon: QrCode }] : []),
    { href: "/my/payments", label: "View payments", icon: CreditCard },
    { href: "/my/certificates", label: "Certificates", icon: Download },
    ...(d.feedbackDue[0] ? [{ href: `/my/registrations/${d.feedbackDue[0].id}/feedback`, label: "Submit feedback", icon: MessageSquareText }] : []),
  ];

  // Events where this student volunteers as a QR scanner.
  const duties = await db.eventVolunteer.findMany({
    where: { userId: user.id, canScan: true, event: { endsAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "ARCHIVED", "DRAFT"] } } },
    select: { event: { select: { id: true, title: true, startsAt: true } } },
    orderBy: { event: { startsAt: "asc" } },
    take: 5,
  });

  return (
    <>
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <span>{user.collegeName ? `${user.collegeName} · ` : ""}Here&apos;s what&apos;s happening with your events.</span>
            <LiveRefresh topics={[`user:${user.id}`]} />
          </span>
        }
        actions={
          <Link href="/events" className={buttonClasses("primary")}>
            <Search aria-hidden />
            Explore events
          </Link>
        }
      />

      {d.pending.length > 0 && (
        <div className="mb-6 space-y-3">
          {d.pending.map((p) => (
            <Alert
              key={p.id}
              tone="warning"
              title={`Complete your payment for ${p.event.title}`}
              action={
                <Link href={`/my/registrations/${p.id}`} className={buttonClasses("primary", "sm", "self-center")}>
                  Pay {formatMoney(p.amount, p.event.currency)}
                </Link>
              }
            >
              Your seat is held until {p.holdExpiresAt ? formatTime(p.holdExpiresAt) : "shortly"}. Pay before then to confirm your registration.
            </Alert>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered events" value={formatNumber(d.stats.registeredCount)} icon={Ticket} />
        <StatCard label="Upcoming events" value={formatNumber(d.stats.upcomingCount)} icon={CalendarClock} />
        <StatCard label="Attended events" value={formatNumber(d.stats.attendedCount)} icon={CalendarCheck2} />
        <StatCard label="Certificates" value={formatNumber(d.stats.certificateCount)} icon={Award} />
      </div>

      <nav aria-label="Quick actions" className="mt-6">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {quickActions.map((a) => (
            <li key={a.href + a.label}>
              <Link
                href={a.href}
                className="flex h-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm font-medium shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/40"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                  <a.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">{a.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Upcoming events</CardTitle>
              <Link href="/my/registrations?status=upcoming" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.upcoming.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={CalendarDays}
                  title="Nothing scheduled"
                  description="You have no upcoming events. Find something interesting to join."
                  action={
                    <Link href="/events" className={buttonClasses("outline", "sm")}>
                      Browse events
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {d.upcoming.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg border border-border bg-surface-2 py-1.5 text-center" aria-hidden>
                        <span className="text-[11px] font-semibold text-primary uppercase">{formatDate(r.event.startsAt, { month: "short" })}</span>
                        <span className="text-lg leading-none font-semibold">{formatDate(r.event.startsAt, { day: "numeric" })}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/my/registrations/${r.id}`} className="font-medium break-words hover:text-primary">
                          {r.event.title}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3.5" aria-hidden />
                            {formatDateRange(r.event.startsAt, r.event.endsAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden />
                            {r.event.mode === "ONLINE" ? "Online" : [r.event.venueName, r.event.city].filter(Boolean).join(", ") || EVENT_MODE[r.event.mode]}
                          </span>
                        </p>
                      </div>
                      <Link href={`/my/registrations/${r.id}`} className={buttonClasses("soft", "sm")}>
                        <QrCode aria-hidden />
                        View QR pass
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {d.feedbackDue.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Share your feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {d.feedbackDue.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{f.event.title}</p>
                        <p className="text-xs text-muted-foreground">Ended {relativeTime(f.event.endsAt)}</p>
                      </div>
                      <Link href={`/my/registrations/${f.id}/feedback`} className={buttonClasses("outline", "sm")}>
                        <MessageSquareText aria-hidden />
                        Give feedback
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Recent registrations</CardTitle>
              <Link href="/my/registrations" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">You haven&apos;t registered for any events yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {d.recent.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`/my/registrations/${r.id}`} className="text-sm font-medium break-words hover:text-primary">
                          {r.event.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Registered {relativeTime(r.createdAt)} · Event on {formatDate(r.event.startsAt)}
                        </p>
                      </div>
                      <RegistrationStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {d.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Your registrations, check-ins, payments and certificates will show up here.</p>
              ) : (
                <ol className="space-y-4">
                  {d.activity.map((a) => (
                    <li key={a.key} className="flex gap-3">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", a.tone)}>
                        <a.icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 pt-1">
                        <Link href={a.href} className="text-sm break-words hover:text-primary">
                          {a.text}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          <time dateTime={a.at.toISOString()}>{relativeTime(a.at)}</time>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          {duties.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="size-4 text-primary" aria-hidden /> Volunteer duties
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {duties.map(({ event }) => (
                    <li key={event.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(event.startsAt)}</p>
                      </div>
                      <Link href={`/organizer/events/${event.id}/scan`} className={buttonClasses("soft", "sm")}>
                        Open scanner
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                Notifications
                {d.notifications.unread > 0 && <Badge tone="primary">{d.notifications.unread} new</Badge>}
              </CardTitle>
              <Link href="/notifications" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.notifications.items.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bell className="size-4" aria-hidden />
                  No notifications yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {d.notifications.items.map((n) => (
                    <li key={n.id} className="flex gap-2.5">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-border-strong" : "bg-primary")} aria-hidden />
                      <div className="min-w-0">
                        <p className={cn("text-sm break-words", !n.readAt && "font-semibold")}>
                          {n.title}
                          {!n.readAt && <span className="sr-only"> (unread)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Certificates</CardTitle>
              <Link href="/my/certificates" className="text-sm font-medium text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {d.certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Attend events to earn certificates. They&apos;ll appear here once issued.</p>
              ) : (
                <ul className="space-y-3">
                  {d.certificates.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {CERTIFICATE_TYPE[c.type]} · {formatDate(c.issuedAt)}
                        </p>
                      </div>
                      <a href={`/api/certificates/${c.code}/pdf`} className={buttonClasses("ghost", "icon")} aria-label={`Download ${c.event.title} certificate`}>
                        <Download aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {d.recommended.length > 0 && (
        <section className="mt-8" aria-label="Recommended events">
          <SectionTitle
            title="Recommended for you"
            action={
              <Link href="/events" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                See all events
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.recommended.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
