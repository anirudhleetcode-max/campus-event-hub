import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Award, CalendarDays, CheckCircle2, CreditCard, MapPin, MessageSquareText, QrCode, Search, Ticket } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { listMyRegistrations } from "@/server/services/registrations";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, PageHeader } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { PaymentStatusBadge, RefundStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { EventCover } from "@/components/events/event-cover";
import { FilterPills } from "@/components/student/filter-pills";
import { EVENT_MODE } from "@/lib/labels";
import { formatDateRange } from "@/lib/utils";

export const metadata: Metadata = { title: "My registrations" };

const TABS = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const EMPTY: Record<Tab, { title: string; description: string }> = {
  all: { title: "No registrations yet", description: "Find something interesting on campus and register in a few clicks." },
  upcoming: { title: "No upcoming events", description: "You're not registered for any upcoming events. Explore what's happening next." },
  past: { title: "No past events", description: "Events you've attended will appear here once they're over." },
  cancelled: { title: "Nothing cancelled", description: "Cancelled or expired registrations will show up here." },
};

export default async function MyRegistrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const status: Tab = TABS.some((t) => t.value === sp.status) ? (sp.status as Tab) : "all";
  const feedbackEventId = typeof sp.feedback === "string" && z.uuid().safeParse(sp.feedback).success ? sp.feedback : null;

  const [items, feedbackReg] = await Promise.all([
    listMyRegistrations(user, { status }),
    feedbackEventId
      ? db.registration.findUnique({
          where: { eventId_userId: { eventId: feedbackEventId, userId: user.id } },
          select: { id: true, status: true, feedback: { select: { id: true } }, event: { select: { title: true } } },
        })
      : null,
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="My registrations"
        description="Your event passes, payments and certificates in one place."
        actions={
          <Link href="/events" className={buttonClasses("primary")}>
            <Search aria-hidden />
            Explore events
          </Link>
        }
      />

      {feedbackReg && feedbackReg.status === "CONFIRMED" && !feedbackReg.feedback && (
        <Alert
          tone="info"
          title={`How was ${feedbackReg.event.title}?`}
          className="mb-5"
          action={
            <Link href={`/my/registrations/${feedbackReg.id}/feedback`} className={buttonClasses("primary", "sm", "self-center")}>
              Give feedback
            </Link>
          }
        >
          Your feedback takes a minute and helps organizers make the next event better.
        </Alert>
      )}

      <FilterPills label="Filter registrations" active={status} items={TABS.map((t) => ({ ...t, href: t.value === "all" ? "/my/registrations" : `/my/registrations?status=${t.value}` }))} />

      <div className="mt-5">
        {items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Ticket}
              title={EMPTY[status].title}
              description={EMPTY[status].description}
              action={
                <Link href="/events" className={buttonClasses("primary")}>
                  Browse events
                </Link>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((r) => {
              const payment = r.payments[0];
              const ended = r.event.endsAt < now;
              const holdActive = r.status === "PENDING_PAYMENT" && !!r.holdExpiresAt && r.holdExpiresAt > now;
              const canFeedback = r.status === "CONFIRMED" && !r.feedback && (ended || r.event.status === "COMPLETED");
              const cert = r.certificates[0];
              return (
                <li key={r.id}>
                  <Card className="flex flex-col overflow-hidden sm:flex-row">
                    <div className="relative aspect-[16/7] shrink-0 bg-surface-2 sm:aspect-auto sm:w-48">
                      <EventCover bannerUrl={r.event.bannerUrl} title={r.event.title} color={r.event.category.color} className="sm:absolute sm:inset-0" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">
                            {r.event.college.shortName ?? r.event.college.name} · {r.event.category.name}
                          </p>
                          <h2 className="mt-0.5 text-base leading-snug font-semibold break-words">
                            <Link href={`/my/registrations/${r.id}`} className="hover:text-primary">
                              {r.event.title}
                            </Link>
                          </h2>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <RegistrationStatusBadge status={r.status} />
                          {payment && <PaymentStatusBadge status={payment.status} />}
                          {payment && <RefundStatusBadge status={payment.refundStatus} />}
                        </div>
                      </div>
                      <ul className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                        <li className="flex items-center gap-2">
                          <CalendarDays className="size-4 shrink-0" aria-hidden />
                          <span className="min-w-0">{formatDateRange(r.event.startsAt, r.event.endsAt)}</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <MapPin className="size-4 shrink-0" aria-hidden />
                          <span className="truncate">{r.event.mode === "ONLINE" ? "Online" : [r.event.venueName, r.event.city].filter(Boolean).join(", ") || EVENT_MODE[r.event.mode]}</span>
                        </li>
                        <li className="flex items-center gap-2 font-mono text-xs">
                          <Ticket className="size-4 shrink-0" aria-hidden />
                          {r.code}
                        </li>
                        {r.attendance && (
                          <li className="flex items-center gap-2 text-success-soft-foreground">
                            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                            Attended
                          </li>
                        )}
                      </ul>
                      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                        {r.status === "CONFIRMED" && !ended && (
                          <Link href={`/my/registrations/${r.id}`} className={buttonClasses("soft", "sm")}>
                            <QrCode aria-hidden />
                            View pass
                          </Link>
                        )}
                        {holdActive && (
                          <Link href={`/my/registrations/${r.id}`} className={buttonClasses("primary", "sm")}>
                            <CreditCard aria-hidden />
                            Complete payment
                          </Link>
                        )}
                        {canFeedback && (
                          <Link href={`/my/registrations/${r.id}/feedback`} className={buttonClasses("outline", "sm")}>
                            <MessageSquareText aria-hidden />
                            Give feedback
                          </Link>
                        )}
                        {cert && (
                          <a href={`/api/certificates/${cert.code}/pdf`} className={buttonClasses("outline", "sm")}>
                            <Award aria-hidden />
                            Certificate
                          </a>
                        )}
                        <Link href={`/my/registrations/${r.id}`} className={buttonClasses("ghost", "sm", "ml-auto")}>
                          Details
                        </Link>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
