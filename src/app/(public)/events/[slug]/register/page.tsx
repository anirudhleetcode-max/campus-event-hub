import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin, ShieldCheck, Ticket, UserRound } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPublicEventBySlug } from "@/server/services/events";
import { getProfile } from "@/server/services/users";
import { getSettings } from "@/server/services/settings";
import { homeFor } from "@/components/layout/nav-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Breadcrumbs, DescriptionList } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { HoldCountdown } from "@/components/payments/hold-countdown";
import { PayButton } from "@/components/payments/pay-button";
import { razorpayConfigured } from "@/server/env";
import { registrationCta, type RegistrationCta } from "@/lib/event-status";
import { EVENT_MODE, ROLE_LABEL } from "@/lib/labels";
import { formatDateRange, formatDateTime, formatMoney } from "@/lib/utils";
import { RegistrationForm } from "./registration-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/events/[slug]/register">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);
  return { title: event ? `Register · ${event.title}` : "Register", robots: { index: false, follow: false } };
}

const CLOSED_COPY: Record<Exclude<RegistrationCta["state"], "open" | "registered" | "pending_payment">, { tone: "info" | "warning" | "danger"; title: string; body: string }> = {
  full: { tone: "warning", title: "This event is full", body: "All seats have been taken. Seats held for pending payments are released automatically if not paid, so check back shortly." },
  not_open: { tone: "info", title: "Registration hasn't opened yet", body: "Registration for this event opens soon. Come back once it opens to reserve your seat." },
  closed: { tone: "warning", title: "Registration is closed", body: "The registration deadline for this event has passed." },
  cancelled: { tone: "danger", title: "This event has been cancelled", body: "The organizer has cancelled this event, so registrations are no longer accepted." },
  ended: { tone: "info", title: "This event has ended", body: "Registrations are closed because the event is already over." },
};

export default async function RegisterPage({ params }: PageProps<"/events/[slug]/register">) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/events/${slug}/register`)}`);

  const event = await getPublicEventBySlug(slug);
  if (!event) notFound();

  const eventHref = `/events/${event.slug}`;
  const breadcrumbs = [
    { label: "Events", href: "/events" },
    { label: event.title, href: eventHref },
    { label: "Register" },
  ];

  if (user.role !== "STUDENT") {
    return (
      <div className="container-page max-w-2xl py-10 sm:py-14">
        <Breadcrumbs items={breadcrumbs} />
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-10">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
              <UserRound className="size-6" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold">Registration is for student accounts</h1>
              <p className="text-sm text-muted-foreground">
                You&apos;re signed in as <span className="font-medium text-foreground">{ROLE_LABEL[user.role]}</span>. Only student accounts can register for
                events. To take part yourself, sign in with a student account.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={eventHref} className={buttonClasses("outline")}>
                <ArrowLeft aria-hidden /> Back to event
              </Link>
              <Link href={homeFor(user.role)} className={buttonClasses("primary")}>
                Go to your dashboard
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [myReg, profile, settings] = await Promise.all([
    db.registration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      select: { id: true, status: true, holdExpiresAt: true },
    }),
    getProfile(user),
    getSettings(),
  ]);
  if (myReg?.status === "CONFIRMED") redirect(`/my/registrations/${myReg.id}`);

  const cta = registrationCta(event, event.seatsTaken, myReg);
  const paid = event.feeAmount > 0;
  const paymentsUnavailable = paid && !razorpayConfigured();
  const seatsLeft = Math.max(0, event.capacity - event.seatsTaken);
  const venue =
    event.mode === "ONLINE" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", ") || "Venue to be announced";

  return (
    <div className="container-page py-8 sm:py-12">
      <Breadcrumbs items={breadcrumbs} />
      <div className="mt-4 mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-[1.7rem]">Register for {event.title}</h1>
        <p className="text-sm text-muted-foreground">
          {paid ? "Confirm your details, then complete the payment to secure your seat." : "Confirm your details to reserve your seat. It's free."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="order-2 min-w-0 space-y-6 lg:order-1">
          {cta.state === "open" && paymentsUnavailable && (
            <Alert tone="warning" title="Online payment is unavailable">
              This event has a registration fee, but online payments haven&apos;t been set up yet, so registration can&apos;t be completed right now.
              Please contact the organizer or check back later.
            </Alert>
          )}

          {cta.state === "open" && !paymentsUnavailable && (
            <Card>
              <CardHeader>
                <CardTitle>Your details</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Registering as <span className="font-medium text-foreground">{profile.name}</span> ({profile.email})
                  {profile.college ? ` · ${profile.college.name}` : ""}
                </p>
              </CardHeader>
              <CardContent>
                <RegistrationForm
                  eventId={event.id}
                  paid={paid}
                  feeLabel={formatMoney(event.feeAmount, event.currency)}
                  requiredFields={event.requiredFields}
                  profile={{
                    phone: profile.phone ?? "",
                    studentId: profile.studentId ?? "",
                    departmentName: profile.department?.name ?? "",
                    year: profile.year ? String(profile.year) : "",
                  }}
                  questions={event.questions.map((q) => ({ id: q.id, label: q.label, type: q.type, required: q.required, options: q.options }))}
                  terms={event.terms}
                />
              </CardContent>
            </Card>
          )}

          {cta.state === "pending_payment" && myReg && (
            <Card>
              <CardHeader>
                <CardTitle>Complete your payment</CardTitle>
                <p className="text-sm text-muted-foreground">
                  You&apos;ve already started registering for this event. Pay {formatMoney(event.feeAmount, event.currency)} to confirm your seat.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {myReg.holdExpiresAt && <HoldCountdown expiresAt={myReg.holdExpiresAt} />}
                <PayButton registrationId={myReg.id} label={`Pay ${formatMoney(event.feeAmount, event.currency)}`} size="lg" className="w-full sm:w-auto" />
              </CardContent>
            </Card>
          )}

          {cta.state !== "open" && cta.state !== "pending_payment" && cta.state !== "registered" && (
            <Alert
              tone={CLOSED_COPY[cta.state].tone}
              title={CLOSED_COPY[cta.state].title}
              action={
                <Link href={eventHref} className="shrink-0 self-center text-sm font-semibold underline underline-offset-2">
                  Back to event
                </Link>
              }
            >
              {cta.state === "not_open" && event.registrationOpensAt
                ? `Registration opens on ${formatDateTime(event.registrationOpensAt)}.`
                : CLOSED_COPY[cta.state].body}
            </Alert>
          )}
        </div>

        <aside className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2" aria-label="Order summary">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Order summary</CardTitle>
                <Badge tone={paid ? "primary" : "success"}>{paid ? "Paid event" : "Free"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <p className="font-semibold break-words">{event.title}</p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{formatDateRange(event.startsAt, event.endsAt)}</span>
                </p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {venue} · {EVENT_MODE[event.mode]}
                  </span>
                </p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <Ticket className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {event.college.name}
                    {cta.state === "open" ? ` · ${seatsLeft} ${seatsLeft === 1 ? "seat" : "seats"} left` : ""}
                  </span>
                </p>
              </div>
              <DescriptionList
                className="border-t border-border"
                items={[
                  { label: "Registration fee", value: formatMoney(event.feeAmount, event.currency) },
                  { label: "Registration closes", value: formatDateTime(event.registrationDeadline) },
                  { label: "Total", value: <span className="text-base">{formatMoney(event.feeAmount, event.currency)}</span> },
                ]}
              />
              {paid && (
                <p className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted-foreground">
                  <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    When you continue, we hold a seat for you for {settings.seatHoldMinutes} minutes while you complete the payment. Unpaid holds are released
                    automatically.
                  </span>
                </p>
              )}
              {paid && (
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">Refund policy</p>
                  <p className="whitespace-pre-line text-muted-foreground">
                    {event.refundPolicy ??
                      "If you cancel before the event starts, a refund request is sent to the organizer. If a payment succeeds after the event fills up, it is refunded automatically in full."}
                  </p>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" aria-hidden />
                {paid ? "Secure payments by Razorpay" : "No payment required"}
              </p>
            </CardContent>
          </Card>
          <Link href={eventHref} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> Back to event details
          </Link>
        </aside>
      </div>
    </div>
  );
}
