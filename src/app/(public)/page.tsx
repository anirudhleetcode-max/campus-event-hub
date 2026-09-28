import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, Award, BarChart3, Bell, Building2, CalendarCheck, CalendarPlus, CheckCircle2, CreditCard, FileSpreadsheet,
  FileText, Layers, Megaphone, MessageSquareText, QrCode, Rocket, ScanLine, ShieldCheck, Ticket, UserCheck, Users,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/server/db";
import { listPublicEvents } from "@/server/services/events";
import { PUBLIC_STATUSES } from "@/lib/event-status";
import { buttonClasses } from "@/components/ui/button";
import { EventCard } from "@/components/events/event-card";
import { MarketingSection, SectionHeading } from "@/components/marketing/section";
import { FaqList } from "@/components/marketing/faq";
import {
  ApprovalQueueMock, CertificateMock, DashboardMock, MiniBars, QrPassMock, RegistrationToastMock,
} from "@/components/marketing/visuals";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Campus Event Hub — Manage Every College Event in One Place" },
  description:
    "Create events, manage registrations, collect payments, track attendance, issue certificates and analyze performance from one centralized platform.",
  alternates: { canonical: "/" },
};

async function platformCounts() {
  const [events, registrations, colleges] = await Promise.all([
    db.event.count({ where: { deletedAt: null, status: { in: PUBLIC_STATUSES }, college: { status: "ACTIVE" } } }),
    db.registration.count({ where: { status: "CONFIRMED" } }),
    db.college.count({ where: { status: "ACTIVE", deletedAt: null } }),
  ]);
  return { events, registrations, colleges };
}

const problems = [
  { tool: "Google Forms", pain: "Registrations scattered across forms nobody can reconcile." },
  { tool: "WhatsApp groups", pain: "Venue changes lost in hundreds of unread messages." },
  { tool: "UPI screenshots", pain: "Payments verified by hand, one screenshot at a time." },
  { tool: "Paper sign-in sheets", pain: "Attendance that can be signed on behalf of a friend." },
  { tool: "Certificate templates", pain: "Names typed manually into slides, with no way to verify them." },
  { tool: "Spreadsheets", pain: "Reports rebuilt from scratch after every single event." },
];

const features: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: CalendarPlus, title: "Event creation & approvals", body: "Rich event pages with schedules, speakers, FAQs and custom registration questions — reviewed by college admins before going live." },
  { icon: Ticket, title: "Registrations with seat control", body: "Capacity, deadlines and eligibility are enforced on the server, so an event can never be oversold." },
  { icon: CreditCard, title: "Payments & refunds", body: "Paid events collect fees through Razorpay with signature-verified confirmation and tracked refunds." },
  { icon: QrCode, title: "QR passes & check-in", body: "Every confirmed participant gets a QR pass. Volunteers scan at the gate and duplicates are rejected instantly." },
  { icon: Award, title: "Verifiable certificates", body: "Issue participation, winner and volunteer certificates in bulk. Anyone can verify one with its unique code." },
  { icon: BarChart3, title: "Analytics & exports", body: "Registrations, revenue, attendance and feedback in one view, with CSV exports when you need them." },
  { icon: Bell, title: "Notifications & reminders", body: "Automatic confirmations, reminders and venue-change alerts by email and in-app notification." },
  { icon: ShieldCheck, title: "Role-based access", body: "Students, organizers, faculty coordinators and admins each see exactly what they are allowed to — and every change is audited." },
];

const steps = [
  { icon: CalendarPlus, title: "Create", body: "An organizer drafts the event: schedule, venue, capacity, fee and the questions to ask at registration." },
  { icon: UserCheck, title: "Approve & publish", body: "The college admin reviews and publishes. The event gets a public page students can discover and share." },
  { icon: CreditCard, title: "Register & pay", body: "Students register in a few taps and pay securely. Seats update live for everyone viewing the page." },
  { icon: ScanLine, title: "Check in & certify", body: "Volunteers scan QR passes at the venue. After the event, attendees give feedback and receive certificates." },
];

const lifecycle: { icon: LucideIcon; label: string }[] = [
  { icon: CalendarPlus, label: "Event creation" },
  { icon: Rocket, label: "Publishing" },
  { icon: Ticket, label: "Registration" },
  { icon: CreditCard, label: "Payment" },
  { icon: CheckCircle2, label: "Confirmation" },
  { icon: QrCode, label: "QR pass" },
  { icon: ScanLine, label: "Attendance" },
  { icon: MessageSquareText, label: "Feedback" },
  { icon: Award, label: "Certificate" },
  { icon: BarChart3, label: "Analytics" },
];

const faqs = [
  { question: "Who can register for events?", answer: "Anyone with a student account can register for published events that are open for registration. Organizers can also restrict eligibility — for example to certain departments or years — and describe it on the event page." },
  { question: "How are payments handled?", answer: "Paid events are processed by Razorpay. Your card, UPI or net-banking details are entered on Razorpay's secure checkout and are never stored by Campus Event Hub. A registration is confirmed only after the payment signature is verified on our server." },
  { question: "What happens if an event is cancelled?", answer: "All registrations are cancelled automatically, participants are notified by email and in-app, and refunds are queued for every captured payment back to the original payment method." },
  { question: "How does QR attendance work?", answer: "Each confirmed registration has a QR pass containing an opaque token — no personal data. Organizers and authorised volunteers scan it at the venue; a pass can only be checked in once." },
  { question: "Can certificates be verified?", answer: "Yes. Every certificate carries a unique verification code. Anyone — for example a recruiter — can confirm it on the public verification page." },
  { question: "Can our college use Campus Event Hub?", answer: "Yes. A platform administrator onboards your college, after which your college admin can add departments, invite organizers and faculty coordinators, and decide whether events need approval before publishing." },
];

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export default async function HomePage() {
  const [upcoming, counts] = await Promise.all([listPublicEvents({ pageSize: 3 }), platformCounts()]);
  const stats = [
    { label: "Events published", value: counts.events },
    { label: "Confirmed registrations", value: counts.registrations },
    { label: "Colleges onboard", value: counts.colleges },
  ];

  return (
    <>
      {/* ── Hero ───────────────────────────────────────── */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden border-b border-border">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_65%)]" aria-hidden />
        <div className="container-page relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              Built for Indian colleges
            </p>
            <h1 id="hero-title" className="mt-5 text-[2.1rem] leading-[1.08] font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Manage Every College Event in <span className="relative whitespace-nowrap text-primary">One Place.<span className="absolute inset-x-0 -bottom-1 h-1.5 rounded-full bg-accent/60" aria-hidden /></span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Create events, manage registrations, collect payments, track attendance, issue certificates and analyze performance from one centralized platform.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/events" className={buttonClasses("primary", "lg")}>
                Explore Events <ArrowRight aria-hidden />
              </Link>
              <Link href="/login?next=/organizer/events/new" className={buttonClasses("outline", "lg")}>
                Create an Event
              </Link>
            </div>
            {counts.events > 0 && (
              <dl className="mt-10 grid max-w-md grid-cols-3 divide-x divide-border border-y border-border py-4">
                {stats.map((s) => (
                  <div key={s.label} className="px-3 first:pl-0">
                    <dt className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{s.label}</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{formatNumber(s.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="relative mx-auto w-full max-w-lg sm:pb-10 lg:max-w-none">
            <DashboardMock className="w-full sm:w-[88%]" />
            <div className="absolute -right-2 -bottom-10 hidden sm:block">
              <QrPassMock className="rotate-2" />
            </div>
            <RegistrationToastMock className="absolute top-8 -right-2 hidden sm:flex" />
          </div>
        </div>
      </section>

      {/* ── Upcoming events (real data) ───────────────── */}
      {upcoming.items.length > 0 && (
        <section aria-labelledby="upcoming-title" className="container-page pt-16 sm:pt-20">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-xs font-medium tracking-wider text-primary uppercase">Happening soon</p>
              <h2 id="upcoming-title" className="mt-2 text-2xl font-semibold tracking-tight">Upcoming events</h2>
            </div>
            <Link href="/events" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Browse all events <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.items.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {/* ── Problem ───────────────────────────────────── */}
      <MarketingSection labelledBy="problem-title">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
          <SectionHeading
            id="problem-title"
            index="01"
            eyebrow="The problem"
            title="College events run on six different tools — and none of them talk to each other."
            description="Organizers spend more time reconciling forms, payments and attendance than running the event itself. Students never know where to look. Admins have no reliable record of what happened."
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {problems.map((p) => (
              <li key={p.tool} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-mono text-xs text-muted-foreground line-through decoration-danger/60">{p.tool}</p>
                <p className="mt-2 text-sm leading-relaxed">{p.pain}</p>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      {/* ── Solution ──────────────────────────────────── */}
      <MarketingSection labelledBy="solution-title" tone="muted">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 flex flex-wrap items-start justify-center gap-4 lg:order-1">
            <QrPassMock />
            <CertificateMock className="sm:mt-10" />
          </div>
          <div className="order-1 lg:order-2">
            <SectionHeading
              id="solution-title"
              index="02"
              eyebrow="The solution"
              title="One record for every event, from the first draft to the final certificate."
              description="Campus Event Hub replaces the patchwork with a single, connected flow. The registration a student makes is the same record that is paid for, scanned at the gate, asked for feedback and certified — so nothing is ever retyped or reconciled."
            />
            <ul className="mt-6 space-y-3 text-sm">
              <Check>Seats, payments and attendance update in real time</Check>
              <Check>Every status change follows a defined event lifecycle</Check>
              <Check>Sensitive actions are permission-checked and audit-logged</Check>
            </ul>
          </div>
        </div>
      </MarketingSection>

      {/* ── Features ──────────────────────────────────── */}
      <MarketingSection id="features" labelledBy="features-title">
        <SectionHeading
          id="features-title"
          index="03"
          eyebrow="Features"
          title="Everything an event needs, nothing it doesn't."
          description="Purpose-built for how colleges actually run fests, hackathons, workshops, seminars and sports meets."
        />
        <ul className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-surface p-5 sm:p-6">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      {/* ── How it works ──────────────────────────────── */}
      <MarketingSection id="how-it-works" labelledBy="how-title" tone="muted">
        <SectionHeading id="how-title" index="04" eyebrow="How it works" title="Four steps from idea to certificate." />
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative rounded-xl border border-border bg-background p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-3xl font-semibold text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <Icon className="size-5 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      {/* ── Student experience ────────────────────────── */}
      <MarketingSection labelledBy="student-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="student-title"
              index="05"
              eyebrow="For students"
              title="Find an event, grab a seat, walk in with your phone."
              description="Browse events from every department and college in one place, filtered by date, category, price or mode."
            />
            <ul className="mt-6 space-y-3 text-sm">
              <Check>Register in seconds with your saved profile</Check>
              <Check>Pay securely with UPI, cards or net banking via Razorpay</Check>
              <Check>Keep every QR pass, receipt and certificate in one dashboard</Check>
              <Check>Get reminders and instant alerts if the venue or time changes</Check>
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <QrPassMock />
            <RegistrationToastMock />
          </div>
        </div>
      </MarketingSection>

      {/* ── Organizer experience ──────────────────────── */}
      <MarketingSection labelledBy="organizer-title" tone="muted">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <DashboardMock className="order-2 lg:order-1" />
          <div className="order-1 lg:order-2">
            <SectionHeading
              id="organizer-title"
              index="06"
              eyebrow="For organizers"
              title="Run the whole event from a single dashboard."
              description="Stop exporting forms into spreadsheets. See who registered, who paid and who showed up — as it happens."
            />
            <ul className="mt-6 space-y-3 text-sm">
              <Check>Custom registration questions and eligibility rules</Check>
              <Check>Add co-organizers, faculty coordinators and scanning volunteers</Check>
              <Check>Announce updates to every registrant in one click</Check>
              <Check>Issue certificates in bulk once attendance is recorded</Check>
            </ul>
          </div>
        </div>
      </MarketingSection>

      {/* ── Admin experience ──────────────────────────── */}
      <MarketingSection labelledBy="admin-title">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="admin-title"
              index="07"
              eyebrow="For college admins"
              title="Oversight without the paperwork."
              description="Approve events before they go public, manage departments and staff, and keep a complete audit trail of every sensitive action."
            />
            <ul className="mt-6 space-y-3 text-sm">
              <Check>Optional approval workflow before events are published</Check>
              <Check>College-wide view of payments, refunds and attendance</Check>
              <Check>Manage departments, organizers and faculty coordinators</Check>
              <Check>Audit logs for approvals, refunds, role changes and more</Check>
            </ul>
          </div>
          <ApprovalQueueMock />
        </div>
      </MarketingSection>

      {/* ── Analytics preview ─────────────────────────── */}
      <MarketingSection labelledBy="analytics-title" tone="muted">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <SectionHeading
            id="analytics-title"
            index="08"
            eyebrow="Analytics"
            title="Know what worked — and prove it."
            description="Registration trends, conversion from registration to attendance, revenue net of refunds, and feedback ratings for every event, department and college. Export any report to CSV for your records or accreditation files."
          />
          <div role="img" aria-label="Illustration of the analytics view" className="rounded-xl border border-border bg-background p-5 shadow-lg">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icon: Users, label: "Registrations" },
                { icon: CalendarCheck, label: "Attendance rate" },
                { icon: CreditCard, label: "Net revenue" },
                { icon: MessageSquareText, label: "Avg. rating" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-lg border border-border bg-surface p-3">
                  <Icon className="size-3.5 text-primary" />
                  <p className="mt-2 text-[11px] text-muted-foreground">{label}</p>
                  <div className="mt-1.5 h-3 w-2/3 rounded bg-surface-3" />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center justify-between text-[11px]">
                <span className="font-medium">Registrations by category</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <FileSpreadsheet className="size-3.5" /> CSV
                </span>
              </div>
              <MiniBars values={[0.55, 0.8, 0.35, 0.95, 0.5, 0.65, 0.3, 0.72]} highlight={3} className="h-28" />
            </div>
          </div>
        </div>
      </MarketingSection>

      {/* ── Event lifecycle ───────────────────────────── */}
      <MarketingSection labelledBy="lifecycle-title">
        <SectionHeading
          id="lifecycle-title"
          index="09"
          eyebrow="Event lifecycle"
          title="Ten stages. One continuous record."
          description="Every event moves through the same well-defined lifecycle, so everyone always knows what happens next."
          align="center"
        />
        <ol className="mt-12 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-5">
          {lifecycle.map(({ icon: Icon, label }, i) => (
            <li key={label} className="relative flex flex-col items-center text-center">
              {(i + 1) % 5 !== 0 && (
                <span className="absolute top-5 left-[calc(50%+1.75rem)] hidden h-px w-[calc(100%-2.5rem)] bg-border-strong sm:block" aria-hidden />
              )}
              <span className="relative flex size-10 items-center justify-center rounded-full border border-border-strong bg-surface text-primary shadow-sm">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span className="mt-2 font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="mt-0.5 text-sm font-medium">{label}</span>
            </li>
          ))}
        </ol>
      </MarketingSection>

      {/* ── FAQ ───────────────────────────────────────── */}
      <MarketingSection id="faq" labelledBy="faq-title" tone="muted">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
          <SectionHeading
            id="faq-title"
            index="10"
            eyebrow="FAQ"
            title="Questions, answered."
            description={
              <>
                Something else on your mind? Read more <Link href="/about" className="font-medium text-primary hover:underline">about the platform</Link>.
              </>
            }
          />
          <FaqList items={faqs} />
        </div>
      </MarketingSection>

      {/* ── CTA ───────────────────────────────────────── */}
      <section aria-labelledby="cta-title" className="container-page py-16 sm:py-24">
        <div className="relative overflow-hidden rounded-2xl bg-foreground px-6 py-12 text-background sm:px-12 sm:py-16">
          <div className="bg-grid pointer-events-none absolute inset-0 opacity-[0.07] invert" aria-hidden />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <h2 id="cta-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">Your next event deserves better than a Google Form.</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed opacity-75 sm:text-base">
                Publish an event page, open registrations and start checking people in — all from one place.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link href="/events" className={buttonClasses("primary", "lg")}>
                Explore Events
              </Link>
              <Link href="/login?next=/organizer/events/new" className={buttonClasses("secondary", "lg")}>
                Create an Event
              </Link>
            </div>
          </div>
          <ul className="relative mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-background/15 pt-6 text-xs opacity-75">
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" aria-hidden /> Payments secured by Razorpay</li>
            <li className="flex items-center gap-1.5"><FileText className="size-3.5" aria-hidden /> Verifiable certificates</li>
            <li className="flex items-center gap-1.5"><Layers className="size-3.5" aria-hidden /> Role-based access</li>
            <li className="flex items-center gap-1.5"><Megaphone className="size-3.5" aria-hidden /> Instant announcements</li>
            <li className="flex items-center gap-1.5"><Building2 className="size-3.5" aria-hidden /> Multi-college ready</li>
          </ul>
        </div>
      </section>
    </>
  );
}
