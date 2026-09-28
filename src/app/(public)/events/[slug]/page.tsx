import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { EventSpeaker, Prisma } from "@prisma/client";
import {
  Building2, CalendarClock, CalendarDays, Clock, ExternalLink, GraduationCap, IndianRupee, Map as MapIcon, MapPin, Navigation,
  Settings2, Tag, UserRound, Users, Video,
} from "lucide-react";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { can, getEventAccess } from "@/server/auth/permissions";
import { getPublicEventBySlug } from "@/server/services/events";
import { registrationCta, type RegistrationCta } from "@/lib/event-status";
import { EVENT_MODE } from "@/lib/labels";
import { formatDate, formatDateRange, formatDateTime, formatMoney, formatNumber } from "@/lib/utils";
import { EventCover } from "@/components/events/event-cover";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Alert, Avatar, Breadcrumbs } from "@/components/ui/misc";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { LiveSeats } from "@/components/realtime/live-seats";
import { FaqList } from "@/components/marketing/faq";
import { PlainText } from "@/components/marketing/rich-text";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const getEvent = cache((slug: string) => getPublicEventBySlug(slug));

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

type ScheduleItem = { time: string; title: string; description?: string };
type FaqItem = { question: string; answer: string };

function isRecord(v: Prisma.JsonValue): v is Prisma.JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSchedule(v: Prisma.JsonValue): ScheduleItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) =>
    isRecord(item) && typeof item.time === "string" && typeof item.title === "string"
      ? [{ time: item.time, title: item.title, description: typeof item.description === "string" && item.description ? item.description : undefined }]
      : [],
  );
}

function parseFaqs(v: Prisma.JsonValue): FaqItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) =>
    isRecord(item) && typeof item.question === "string" && typeof item.answer === "string" && item.question.trim()
      ? [{ question: item.question, answer: item.answer }]
      : [],
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) return { title: "Event not found", robots: { index: false } };
  const title = `${event.title} · ${event.college.shortName ?? event.college.name}`;
  const images = event.bannerUrl ? [{ url: event.bannerUrl, alt: event.title }] : undefined;
  return {
    title,
    description: event.summary,
    alternates: { canonical: `/events/${event.slug}` },
    openGraph: {
      type: "website",
      title: event.title,
      description: event.summary,
      url: `/events/${event.slug}`,
      siteName: "Campus Event Hub",
      locale: "en_IN",
      images,
    },
    twitter: { card: event.bannerUrl ? "summary_large_image" : "summary", title: event.title, description: event.summary, images: event.bannerUrl ? [event.bannerUrl] : undefined },
  };
}

type PublicEvent = NonNullable<Awaited<ReturnType<typeof getPublicEventBySlug>>>;

function jsonLd(event: PublicEvent, publicCta: RegistrationCta) {
  const url = `${SITE_URL}/events/${event.slug}`;
  const place = {
    "@type": "Place",
    name: event.venueName ?? event.college.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: event.venueAddress ?? undefined,
      addressLocality: event.city ?? event.college.city ?? undefined,
      addressCountry: "IN",
    },
    geo: event.latitude != null && event.longitude != null ? { "@type": "GeoCoordinates", latitude: event.latitude, longitude: event.longitude } : undefined,
  };
  const virtual = { "@type": "VirtualLocation", url };
  const availability =
    publicCta.state === "open" ? "InStock" : publicCta.state === "not_open" ? "PreOrder" : publicCta.state === "full" ? "SoldOut" : "Discontinued";
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary,
    url,
    startDate: event.startsAt.toISOString(),
    endDate: event.endsAt.toISOString(),
    eventStatus: event.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode:
      event.mode === "ONLINE"
        ? "https://schema.org/OnlineEventAttendanceMode"
        : event.mode === "HYBRID"
          ? "https://schema.org/MixedEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
    location: event.mode === "ONLINE" ? virtual : event.mode === "HYBRID" ? [place, virtual] : place,
    image: event.bannerUrl ? [event.bannerUrl] : undefined,
    organizer: { "@type": "Organization", name: event.college.name, url: SITE_URL },
    offers: {
      "@type": "Offer",
      url,
      price: (event.feeAmount / 100).toFixed(2),
      priceCurrency: event.currency || "INR",
      availability: `https://schema.org/${availability}`,
      validFrom: (event.registrationOpensAt ?? event.publishedAt ?? event.createdAt).toISOString(),
      validThrough: event.registrationDeadline.toISOString(),
    },
    maximumAttendeeCapacity: event.capacity,
    remainingAttendeeCapacity: Math.max(0, event.capacity - event.seatsTaken),
    keywords: event.tags.length ? event.tags.join(", ") : undefined,
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const SPEAKER_GROUPS: { role: EventSpeaker["role"]; title: string }[] = [
  { role: "SPEAKER", title: "Speakers" },
  { role: "JUDGE", title: "Judges" },
  { role: "GUEST", title: "Guests" },
];

export default async function EventDetailsPage({ params }: Props) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event) notFound();

  const user = await getCurrentUser();
  const [myRegistration, access] = await Promise.all([
    user
      ? db.registration.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: user.id } },
          select: { id: true, status: true, holdExpiresAt: true },
        })
      : Promise.resolve(null),
    user && can(user, "events:staff-area") ? getEventAccess(user, event.id).then((r) => r.access) : Promise.resolve(null),
  ]);

  const cta = registrationCta(event, event.seatsTaken, myRegistration);
  const publicCta = registrationCta(event, event.seatsTaken, null);
  const isStudent = user?.role === "STUDENT";
  const canManage = Boolean(access?.canView);
  const registerHref = `/events/${event.slug}/register`;
  const isConfirmed = myRegistration?.status === "CONFIRMED";
  const onlineUrl = event.onlineUrl && /^https?:\/\//i.test(event.onlineUrl) ? event.onlineUrl : null;
  const showOnlineLink = Boolean(onlineUrl) && (isConfirmed || canManage);
  const actionable = cta.state === "open" || cta.state === "registered" || cta.state === "pending_payment";

  const schedule = parseSchedule(event.schedule);
  const faqs = parseFaqs(event.faqs);
  const hasCoords = event.latitude != null && event.longitude != null;
  const address = [event.venueAddress, event.city].filter(Boolean).join(", ");

  const ctaAction = (() => {
    const full = "w-full";
    if (cta.state === "open") {
      if (!user) return <Link href={`/login?next=${encodeURIComponent(registerHref)}`} className={buttonClasses("primary", "lg", full)}>{cta.label}</Link>;
      if (isStudent) return <Link href={registerHref} className={buttonClasses("primary", "lg", full)}>{cta.label}</Link>;
      return <Button size="lg" className={full} disabled>{cta.label}</Button>;
    }
    if (cta.state === "registered" && myRegistration) {
      return <Link href={`/my/registrations/${myRegistration.id}`} className={buttonClasses("primary", "lg", full)}>{cta.label}</Link>;
    }
    if (cta.state === "pending_payment") {
      return <Link href={registerHref} className={buttonClasses("primary", "lg", full)}>{cta.label}</Link>;
    }
    return <Button size="lg" variant="secondary" className={full} disabled>{cta.label}</Button>;
  })();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(event, publicCta) }} />
      <div className="container-page py-6 sm:py-10">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.title }]} />

        <div className="mt-4 aspect-[16/9] overflow-hidden rounded-2xl border border-border bg-surface-2 sm:aspect-[21/8]">
          <EventCover bannerUrl={event.bannerUrl} title={event.title} categorySlug={event.category.slug} color={event.category.color} priority />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          {/* ── Main content ─────────────────────────── */}
          <div className="min-w-0 space-y-10">
            <header>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{event.category.name}</Badge>
                <EventStatusBadge status={event.status} />
                <Badge>{EVENT_MODE[event.mode]}</Badge>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight break-words sm:text-4xl">{event.title}</h1>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{event.summary}</p>
              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <Fact icon={CalendarDays} label="Date & time" value={formatDateRange(event.startsAt, event.endsAt)} />
                <Fact
                  icon={event.mode === "ONLINE" ? Video : MapPin}
                  label="Venue"
                  value={event.mode === "ONLINE" ? "Online event" : [event.venueName, event.city].filter(Boolean).join(", ") || "To be announced"}
                />
                <Fact icon={Building2} label="Hosted by" value={event.college.name} />
                {event.department && <Fact icon={GraduationCap} label="Department" value={event.department.name} />}
                <Fact icon={UserRound} label="Organizer" value={event.organizer.name} />
              </dl>
              <a href="#register" className={buttonClasses(actionable ? "primary" : "outline", "md", "mt-6 w-full sm:w-auto lg:hidden")}>
                {actionable ? cta.label : "Registration details"}
              </a>
            </header>

            {event.status === "CANCELLED" && (
              <Alert tone="danger" title="This event has been cancelled">
                {event.cancelReason ? `${event.cancelReason} ` : ""}Registered participants have been notified and any payments are being refunded to the
                original payment method.
              </Alert>
            )}

            <DetailSection id="about" title="About this event">
              <PlainText text={event.description} />
            </DetailSection>

            {schedule.length > 0 && (
              <DetailSection id="schedule" title="Schedule">
                <ol className="relative space-y-5 border-l border-border pl-6">
                  {schedule.map((s, i) => (
                    <li key={`${s.time}-${i}`} className="relative">
                      <span className="absolute top-1.5 -left-[1.72rem] size-2.5 rounded-full border-2 border-surface bg-primary ring-1 ring-primary/30" aria-hidden />
                      <p className="font-mono text-xs font-medium text-primary">{s.time}</p>
                      <p className="mt-0.5 font-medium">{s.title}</p>
                      {s.description && <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{s.description}</p>}
                    </li>
                  ))}
                </ol>
              </DetailSection>
            )}

            {SPEAKER_GROUPS.map(({ role, title }) => {
              const people = event.speakers.filter((s) => s.role === role);
              if (people.length === 0) return null;
              return (
                <DetailSection key={role} id={title.toLowerCase()} title={title}>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {people.map((p) => (
                      <li key={p.id} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                        <Avatar name={p.name} src={p.photoUrl} size={44} />
                        <div className="min-w-0">
                          <p className="font-medium">{p.name}</p>
                          {(p.title || p.organization) && (
                            <p className="text-sm text-muted-foreground">{[p.title, p.organization].filter(Boolean).join(", ")}</p>
                          )}
                          {p.bio && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.bio}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              );
            })}

            {event.mode !== "ONLINE" && (event.venueName || address || hasCoords) && (
              <DetailSection id="venue" title="Venue">
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      {event.venueName && <p className="font-medium">{event.venueName}</p>}
                      {address && <p className="text-sm text-muted-foreground">{address}</p>}
                    </div>
                  </div>
                  {hasCoords && (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${event.latitude}&mlon=${event.longitude}#map=17/${event.latitude}/${event.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses("outline", "sm")}
                      >
                        <MapIcon aria-hidden /> View on map
                        <span className="sr-only"> (opens OpenStreetMap in a new tab)</span>
                      </a>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses("outline", "sm")}
                      >
                        <Navigation aria-hidden /> Get directions
                        <span className="sr-only"> (opens Google Maps in a new tab)</span>
                      </a>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            {event.eligibility && (
              <DetailSection id="eligibility" title="Eligibility">
                <PlainText text={event.eligibility} />
              </DetailSection>
            )}
            {event.rules && (
              <DetailSection id="rules" title="Rules">
                <PlainText text={event.rules} />
              </DetailSection>
            )}
            {event.terms && (
              <DetailSection id="terms" title="Terms & conditions">
                <PlainText text={event.terms} />
              </DetailSection>
            )}
            {event.refundPolicy && (
              <DetailSection id="refund-policy" title="Refund policy">
                <PlainText text={event.refundPolicy} />
              </DetailSection>
            )}

            {faqs.length > 0 && (
              <DetailSection id="faqs" title="Frequently asked questions">
                <FaqList items={faqs} />
              </DetailSection>
            )}

            {event.tags.length > 0 && (
              <DetailSection id="tags" title="Tags">
                <ul className="flex flex-wrap gap-2">
                  {event.tags.map((t) => (
                    <li key={t}>
                      <Link
                        href={`/events?q=${encodeURIComponent(t)}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground hover:border-border-strong hover:text-foreground"
                      >
                        <Tag className="size-3" aria-hidden />
                        {t}
                      </Link>
                    </li>
                  ))}
                </ul>
              </DetailSection>
            )}
          </div>

          {/* ── Registration sidebar ─────────────────── */}
          <aside id="register" aria-labelledby="register-title" className="scroll-mt-24">
            <div className="space-y-5 rounded-xl border border-border bg-surface p-5 shadow-md lg:sticky lg:top-24 sm:p-6">
              <div>
                <h2 id="register-title" className="text-sm font-medium text-muted-foreground">
                  Registration fee
                </h2>
                <p className="mt-1 text-3xl font-semibold tracking-tight">{formatMoney(event.feeAmount, event.currency)}</p>
              </div>

              <div className="space-y-2">
                {ctaAction}
                {cta.state === "not_open" && event.registrationOpensAt && (
                  <p className="text-center text-xs text-muted-foreground">Opens {formatDateTime(event.registrationOpensAt)}</p>
                )}
                {cta.state === "pending_payment" && myRegistration?.holdExpiresAt && (
                  <p className="text-center text-xs text-muted-foreground">Your seat is held until {formatDateTime(myRegistration.holdExpiresAt)}</p>
                )}
                {cta.state === "open" && !user && <p className="text-center text-xs text-muted-foreground">You&apos;ll be asked to log in or sign up first.</p>}
              </div>

              {user && !isStudent && (
                <Alert tone="info">Only student accounts can register for events.</Alert>
              )}

              {event.status !== "CANCELLED" && <LiveSeats eventId={event.id} capacity={event.capacity} initialTaken={event.seatsTaken} />}

              <dl className="space-y-3 border-t border-border pt-5 text-sm">
                <SideFact icon={CalendarClock} label="Register by" value={formatDateTime(event.registrationDeadline)} />
                <SideFact icon={Users} label="Participant limit" value={`${formatNumber(event.capacity)} participants`} />
                <SideFact icon={Clock} label="Starts" value={formatDate(event.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} />
                <SideFact icon={IndianRupee} label="Fee" value={event.feeAmount > 0 ? `${formatMoney(event.feeAmount, event.currency)} per participant` : "Free entry"} />
                {event.mode !== "IN_PERSON" && (
                  <SideFact
                    icon={Video}
                    label="Online access"
                    value={
                      showOnlineLink && onlineUrl ? (
                        <a href={onlineUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium break-all text-primary hover:underline">
                          Join online <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                        </a>
                      ) : (
                        "Link shared after registration"
                      )
                    }
                  />
                )}
              </dl>

              {canManage && (
                <Link href={`/organizer/events/${event.id}`} className="flex items-center justify-center gap-1.5 border-t border-border pt-4 text-sm font-medium text-primary hover:underline">
                  <Settings2 className="size-4" aria-hidden /> Manage event
                </Link>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium break-words">{value}</dd>
      </div>
    </div>
  );
}

function SideFact({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}

function DetailSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
