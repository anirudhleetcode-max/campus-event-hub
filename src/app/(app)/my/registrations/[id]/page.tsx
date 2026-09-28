import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import {
  Award, CalendarDays, CheckCircle2, Circle, Clock, CreditCard, Download, ExternalLink, FileText, MapPin, MessageSquareText, QrCode, Receipt, Ticket, Video, XCircle,
} from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getMyRegistration } from "@/server/services/registrations";
import { feedbackEligibility } from "@/server/services/feedback";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, PageHeader } from "@/components/ui/misc";
import { QRCodeSvg } from "@/components/ui/qr-code";
import { PaymentStatusBadge, RefundStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { EventCover } from "@/components/events/event-cover";
import { PayButton } from "@/components/payments/pay-button";
import { HoldCountdown } from "@/components/payments/hold-countdown";
import { AddToCalendarButton } from "@/components/student/add-to-calendar";
import { CancelRegistrationButton } from "@/components/student/cancel-registration-button";
import { PrintArea } from "@/components/student/print-area";
import { PrintButton } from "@/components/student/print-button";
import { CERTIFICATE_TYPE, EVENT_MODE } from "@/lib/labels";
import { isRegistrationOpen } from "@/lib/event-status";
import { cn, formatDate, formatDateRange, formatDateTime, formatMoney, formatTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Registration" };

async function load(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    return { user, reg: await getMyRegistration(user, id) };
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}

type Step = { label: string; at: Date | null; done: boolean; detail?: string; tone?: "danger" };

export default async function RegistrationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user, reg } = await load(id);
  const ev = reg.event;
  const now = new Date();

  const eligibility = await feedbackEligibility(user.id, ev.id);
  const payment = reg.payments[0] ?? null;
  const captured = reg.payments.find((p) => p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED") ?? null;
  const confirmed = reg.status === "CONFIRMED";
  const paid = reg.amount > 0;
  const holdActive = reg.status === "PENDING_PAYMENT" && !!reg.holdExpiresAt && reg.holdExpiresAt > now;
  const canRetryPayment = paid && (reg.status === "PENDING_PAYMENT" || reg.status === "EXPIRED") && isRegistrationOpen(ev, now);
  const canCancel = (reg.status === "CONFIRMED" || reg.status === "PENDING_PAYMENT") && !reg.attendance && ev.startsAt > now && ev.status !== "CANCELLED";
  const ended = ev.endsAt < now;
  const location = ev.mode === "ONLINE" ? "Online" : [ev.venueName, ev.venueAddress, ev.city].filter(Boolean).join(", ");
  const meetingUrl = confirmed && ev.mode !== "IN_PERSON" && ev.onlineUrl && /^https?:\/\//.test(ev.onlineUrl) ? ev.onlineUrl : null;

  const steps: Step[] = [
    { label: "Registered", at: reg.createdAt, done: true, detail: `Registration ${reg.code}` },
    ...(paid
      ? [{ label: "Payment", at: captured?.paidAt ?? null, done: !!captured, detail: captured ? formatMoney(captured.amount, captured.currency) : reg.status === "PENDING_PAYMENT" ? "Awaiting payment" : undefined }]
      : []),
    ...(reg.status === "CANCELLED" || reg.status === "EXPIRED" || reg.status === "FAILED"
      ? [{ label: reg.status === "CANCELLED" ? "Cancelled" : reg.status === "EXPIRED" ? "Seat hold expired" : "Payment failed", at: reg.cancelledAt ?? reg.updatedAt, done: true, detail: reg.cancelReason ?? undefined, tone: "danger" as const }]
      : [
          { label: "Confirmed", at: reg.confirmedAt, done: confirmed, detail: confirmed ? "QR pass issued" : undefined },
          { label: "Checked in", at: reg.attendance?.checkInAt ?? null, done: !!reg.attendance, detail: reg.attendance ? `via ${reg.attendance.method === "QR" ? "QR scan" : "manual check-in"}` : undefined },
          { label: "Feedback", at: reg.feedback?.createdAt ?? null, done: !!reg.feedback, detail: reg.feedback ? `Rated ${reg.feedback.overall}/5` : undefined },
          { label: "Certificate", at: reg.certificates[0]?.issuedAt ?? null, done: reg.certificates.length > 0, detail: reg.certificates[0] ? CERTIFICATE_TYPE[reg.certificates[0].type] : undefined },
        ]),
  ];

  return (
    <>
      <PageHeader
        title={ev.title}
        breadcrumbs={[{ label: "My registrations", href: "/my/registrations" }, { label: reg.code }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RegistrationStatusBadge status={reg.status} />
            <span>{ev.college.name}</span>
            <LiveRefresh topics={[`user:${user.id}`]} debounceMs={600} />
          </span>
        }
        actions={
          <>
            {!ended && reg.status !== "CANCELLED" && (
              <AddToCalendarButton
                filename={`${ev.slug}`}
                event={{
                  uid: `${reg.code}@campus-event-hub`,
                  title: ev.title,
                  description: `Registration ${reg.code}${meetingUrl ? `\nJoin: ${meetingUrl}` : ""}`,
                  location: meetingUrl ?? (location || undefined),
                  url: `/events/${ev.slug}`,
                  startsAt: ev.startsAt.toISOString(),
                  endsAt: ev.endsAt.toISOString(),
                }}
              />
            )}
            <Link href={`/events/${ev.slug}`} className={buttonClasses("ghost")}>
              Event page
              <ExternalLink aria-hidden />
            </Link>
          </>
        }
      />

      <div className="space-y-4">
        {sp.welcome === "1" && confirmed && (
          <Alert tone="success" title="You're registered!">
            Your seat is confirmed. We&apos;ve emailed your QR pass — you can also show it from this page at the entrance.
          </Alert>
        )}
        {sp.paid === "1" && confirmed && (
          <Alert tone="success" title="Payment successful">
            Thanks! Your payment was received and your registration is confirmed.
          </Alert>
        )}
        {sp.paid === "1" && reg.status === "PENDING_PAYMENT" && (
          <Alert tone="info" title="Confirming your payment…">
            We&apos;re waiting for the payment gateway to confirm your payment. This page updates automatically.
          </Alert>
        )}
        {ev.status === "CANCELLED" && (
          <Alert tone="danger" title="This event has been cancelled">
            {paid && captured ? "Any payment you made will be refunded as per the event's refund policy." : "We're sorry for the inconvenience."}
          </Alert>
        )}
        {reg.status === "CANCELLED" && reg.cancelReason && (
          <Alert tone="warning" title="Registration cancelled">
            {reg.cancelReason}
            {reg.cancelledAt ? ` · ${formatDateTime(reg.cancelledAt)}` : ""}
          </Alert>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {confirmed && (
            <PrintArea>
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-primary-soft px-5 py-3 text-primary-soft-foreground sm:px-6">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Ticket className="size-4" aria-hidden />
                    Event pass
                  </p>
                  <p className="font-mono text-sm font-semibold tracking-wide">{reg.code}</p>
                </div>
                <div className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-start sm:p-6">
                  <QRCodeSvg value={`CEH1:${reg.qrToken}`} label={`QR pass for registration ${reg.code}`} className="size-52 shrink-0 border border-border sm:size-56" />
                  <div className="w-full min-w-0 flex-1 space-y-4">
                    <div>
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Participant</p>
                      <p className="text-lg font-semibold break-words">{reg.participantName}</p>
                      <p className="text-sm break-all text-muted-foreground">{reg.participantEmail}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Event</p>
                      <p className="font-semibold break-words">{ev.title}</p>
                      <p className="text-sm text-muted-foreground">{ev.college.name}</p>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        {formatDateRange(ev.startsAt, ev.endsAt)}
                      </li>
                      <li className="flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 break-words">{location || EVENT_MODE[ev.mode]}</span>
                      </li>
                    </ul>
                    {reg.attendance ? (
                      <Badge tone="success">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        Checked in {formatDateTime(reg.attendance.checkInAt)}
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">Show this QR code at the entrance. Keep screen brightness up for faster scanning.</p>
                    )}
                    <div className="flex flex-wrap gap-2 print:hidden">
                      <PrintButton label="Download pass" variant="soft" size="sm" />
                    </div>
                  </div>
                </div>
              </Card>
            </PrintArea>
          )}

          {(reg.status === "PENDING_PAYMENT" || reg.status === "EXPIRED") && paid && (
            <Card>
              <CardHeader>
                <CardTitle>Complete your payment</CardTitle>
                <CardDescription>Your registration is confirmed as soon as the payment of {formatMoney(reg.amount, ev.currency)} goes through.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {holdActive && reg.holdExpiresAt && <HoldCountdown expiresAt={reg.holdExpiresAt.toISOString()} />}
                {canRetryPayment ? (
                  <PayButton registrationId={reg.id} label={holdActive ? `Pay ${formatMoney(reg.amount, ev.currency)}` : "Reserve seat & pay"} />
                ) : (
                  <Alert tone="warning" title="Payment is no longer possible">
                    Registration for this event has closed, so this unpaid registration can&apos;t be completed.
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5">
                {steps.map((s, i) => (
                  <li key={s.label} className="relative flex gap-3">
                    {i < steps.length - 1 && <span className={cn("absolute top-6 left-[11px] h-[calc(100%-0.25rem)] w-px", s.done ? "bg-success/50" : "bg-border")} aria-hidden />}
                    <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface">
                      {s.tone === "danger" ? (
                        <XCircle className="size-6 text-danger" aria-hidden />
                      ) : s.done ? (
                        <CheckCircle2 className="size-6 text-success" aria-hidden />
                      ) : (
                        <Circle className="size-6 text-border-strong" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={cn("text-sm font-medium", !s.done && "text-muted-foreground")}>
                        {s.label}
                        <span className="sr-only">{s.done ? " — done" : " — pending"}</span>
                      </p>
                      {(s.at || s.detail) && (
                        <p className="text-xs text-muted-foreground">
                          {[s.detail, s.at && s.done ? formatDateTime(s.at) : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {paid && reg.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {reg.payments.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {formatMoney(p.amount, p.currency)}
                          <PaymentStatusBadge status={p.status} />
                          <RefundStatusBadge status={p.refundStatus} />
                          {p.mode !== "LIVE" && <Badge tone="warning">{p.mode === "DEMO" ? "Demo" : "Test mode"}</Badge>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Receipt {p.receipt} · {formatDateTime(p.paidAt ?? p.createdAt)}
                          {p.failureReason ? ` · ${p.failureReason}` : ""}
                          {p.refundStatus !== "NONE" && p.refundAmount > 0 ? ` · Refund ${formatMoney(p.refundAmount, p.currency)}` : ""}
                        </p>
                      </div>
                      {(p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED") && (
                        <Link href={`/my/payments/${p.id}`} className={buttonClasses("outline", "sm")}>
                          <Receipt aria-hidden />
                          Receipt
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {payment?.refundStatus === "REQUESTED" && ev.refundPolicy && (
                  <p className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Refund policy:</span> {ev.refundPolicy}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {reg.answers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Your answers</CardTitle>
              </CardHeader>
              <CardContent>
                <DescriptionList items={reg.answers.map((a) => ({ label: a.question.label, value: a.value === "true" ? "Yes" : a.value }))} />
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card className="overflow-hidden">
            <div className="aspect-[16/8] bg-surface-2">
              <EventCover bannerUrl={ev.bannerUrl} title={ev.title} />
            </div>
            <CardContent className="pt-5 sm:pt-5">
              <DescriptionList
                items={[
                  { label: "Date", value: formatDate(ev.startsAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) },
                  { label: "Time", value: `${formatTime(ev.startsAt)} – ${formatTime(ev.endsAt)}` },
                  { label: "Mode", value: EVENT_MODE[ev.mode] },
                  ...(ev.mode !== "ONLINE" && location ? [{ label: "Venue", value: location }] : []),
                  { label: "Fee", value: formatMoney(ev.feeAmount, ev.currency) },
                  ...(reg.attendance ? [{ label: "Checked in", value: formatDateTime(reg.attendance.checkInAt) }] : []),
                  ...(reg.attendance?.checkOutAt ? [{ label: "Checked out", value: formatDateTime(reg.attendance.checkOutAt) }] : []),
                ]}
              />
              {meetingUrl && !ended && (
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("primary", "md", "mt-4 w-full")}>
                  <Video aria-hidden />
                  Join online session
                </a>
              )}
            </CardContent>
          </Card>

          {eligibility.eligible && (
            <Card className="border-primary/30 bg-primary-soft/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-primary" aria-hidden />
                  Share your feedback
                </CardTitle>
                <CardDescription>Tell the organizers what worked and what could be better.</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/my/registrations/${reg.id}/feedback`} className={buttonClasses("primary", "md", "w-full")}>
                  Give feedback
                </Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="size-4 text-muted-foreground" aria-hidden />
                Certificates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reg.certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {reg.attendance ? "Your certificate will appear here once the organizer issues it." : "Certificates are issued to participants who attend the event."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {reg.certificates.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{CERTIFICATE_TYPE[c.type]}</p>
                        <p className="font-mono text-xs text-muted-foreground">{c.code}</p>
                      </div>
                      <a href={`/api/certificates/${c.code}/pdf`} className={buttonClasses("outline", "sm")}>
                        <Download aria-hidden />
                        PDF
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                Registration details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DescriptionList
                items={[
                  { label: "Registration ID", value: <span className="font-mono">{reg.code}</span> },
                  { label: "Registered on", value: formatDateTime(reg.createdAt) },
                  ...(reg.participantPhone ? [{ label: "Phone", value: reg.participantPhone }] : []),
                  ...(reg.studentId ? [{ label: "Student ID", value: reg.studentId }] : []),
                  ...(reg.departmentName ? [{ label: "Department", value: reg.departmentName }] : []),
                  ...(reg.year ? [{ label: "Year", value: `Year ${reg.year}` }] : []),
                ]}
              />
              {canCancel ? (
                <div className="border-t border-border pt-4">
                  <CancelRegistrationButton registrationId={reg.id} eventTitle={ev.title} paid={reg.status === "CONFIRMED" && paid} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    <Clock className="mr-1 inline size-3" aria-hidden />
                    You can cancel until the event starts ({formatDateTime(ev.startsAt)}).
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {!confirmed && reg.status !== "PENDING_PAYMENT" && !canRetryPayment && (
            <Link href={`/events/${ev.slug}`} className={buttonClasses("outline", "md", "w-full")}>
              <QrCode aria-hidden />
              View event & register again
            </Link>
          )}
          {confirmed && paid && captured && (
            <Link href={`/my/payments/${captured.id}`} className={buttonClasses("ghost", "md", "w-full")}>
              <CreditCard aria-hidden />
              View payment receipt
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
