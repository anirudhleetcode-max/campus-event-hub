import type { Metadata } from "next";
import Link from "next/link";
import { Accessibility, ArrowRight, Building2, Database, Layers, Lock, Users } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { MarketingSection, SectionHeading } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "About",
  description:
    "Campus Event Hub brings the complete college event lifecycle — creation, registration, payments, attendance, certificates and analytics — into one secure platform.",
  alternates: { canonical: "/about" },
};

const principles = [
  {
    icon: Lock,
    title: "Security by default",
    body: "Every action is checked on the server against the user's role and their relationship to the event. Payments are verified by signature, passwords are hashed, sessions can be revoked, and sensitive changes are recorded in an audit log.",
  },
  {
    icon: Database,
    title: "Data integrity",
    body: "Seat allocation happens inside database transactions, so capacity is never exceeded — even when hundreds of students register at once. Event status follows a strict lifecycle, and money is always stored in exact integer paise.",
  },
  {
    icon: Accessibility,
    title: "Accessible to everyone",
    body: "Semantic HTML, keyboard-operable controls, visible focus, sufficient contrast in light and dark themes, and layouts that work on a budget phone as well as a desktop.",
  },
];

const forColleges = [
  { icon: Building2, title: "Your college, your rules", body: "Decide whether events need admin approval before they are published, and manage departments and staff roles." },
  { icon: Users, title: "Every role covered", body: "College admins, event organizers, faculty coordinators, volunteers and students each get a focused workspace." },
  { icon: Layers, title: "Records that last", body: "Registrations, payments, attendance, feedback and certificates stay linked — ready for reports and accreditation." },
];

export default function AboutPage() {
  return (
    <>
      <section aria-labelledby="about-title" className="border-b border-border">
        <div className="container-page py-14 sm:py-20">
          <p className="font-mono text-xs font-medium tracking-wider text-primary uppercase">About Campus Event Hub</p>
          <h1 id="about-title" className="mt-4 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
            We&apos;re building the operating system for campus life&apos;s best moments.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Fests, hackathons, workshops, seminars and sports meets are where students discover what they love. Our mission is to make running
            them effortless for organizers, transparent for administrators and delightful for participants.
          </p>
        </div>
      </section>

      <MarketingSection labelledBy="fragmentation-title">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            id="fragmentation-title"
            index="01"
            eyebrow="Why we exist"
            title="Event management on campus is fragmented."
          />
          <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
            <p>
              A typical college event today starts as a Google Form, gets promoted over WhatsApp, collects fees through UPI screenshots, takes
              attendance on paper and ends with certificates edited one by one in a slide deck.
            </p>
            <p>
              Each tool holds a fragment of the truth. Organizers reconcile them late into the night, students chase confirmations, and
              administrators are left without a dependable record of who attended, who paid and who was refunded.
            </p>
            <p className="text-foreground">
              Campus Event Hub replaces those fragments with a single, connected record for every event — from the first draft to the final
              certificate.
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection labelledBy="principles-title" tone="muted">
        <SectionHeading id="principles-title" index="02" eyebrow="Principles" title="What we will not compromise on." />
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {principles.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-xl border border-border bg-background p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection labelledBy="colleges-title">
        <SectionHeading
          id="colleges-title"
          index="03"
          eyebrow="For colleges"
          title="Bring your whole campus onto one platform."
          description="Campus Event Hub is multi-college by design. Each college's data, staff and events are isolated, while students can still discover events across campuses."
        />
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {forColleges.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <section aria-labelledby="about-cta" className="container-page pb-16 sm:pb-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-10 md:flex-row md:items-center">
          <div>
            <h2 id="about-cta" className="text-xl font-semibold tracking-tight sm:text-2xl">See it in action.</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">Browse live events or sign in to start organizing your own.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/events" className={buttonClasses("primary", "lg")}>
              Explore Events <ArrowRight aria-hidden />
            </Link>
            <Link href="/login?next=/organizer/events/new" className={buttonClasses("outline", "lg")}>
              Create an Event
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
