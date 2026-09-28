import Link from "next/link";
import { Award, CalendarCheck2, CreditCard, QrCode, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const highlights = [
  { icon: CalendarCheck2, title: "Discover & register", text: "Browse events across your campus and sign up in seconds." },
  { icon: CreditCard, title: "Secure payments", text: "Pay event fees safely through Razorpay with instant receipts." },
  { icon: QrCode, title: "QR check-in", text: "Your digital pass is ready the moment you register." },
  { icon: Award, title: "Verified certificates", text: "Download certificates anyone can verify online." },
];

const footerLinks = [
  { href: "/events", label: "Explore events" },
  { href: "/verify", label: "Verify a certificate" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border border-primary-foreground/15" />
      <div aria-hidden className="pointer-events-none absolute -top-8 -right-8 size-48 rounded-full border border-primary-foreground/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-primary-foreground/5" />

      <div className="relative max-w-md space-y-3">
        <p className="text-sm font-medium tracking-wide uppercase opacity-95">Campus Event Hub</p>
        <h2 className="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">Every college event, from first draft to final certificate.</h2>
        <p className="text-base opacity-85">One place for students, organizers and administrators to run events without spreadsheets.</p>
      </div>

      <div className="relative my-10 max-w-sm rounded-2xl bg-surface p-5 text-foreground shadow-lg" aria-hidden>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Event pass</p>
            <div className="h-3 w-40 rounded-full bg-surface-3" />
            <div className="h-3 w-28 rounded-full bg-surface-3" />
          </div>
          <span className="flex size-14 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
            <QrCode className="size-8" />
          </span>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-soft-foreground">
          <ShieldCheck className="size-4" />
          Registration confirmed
        </div>
      </div>

      <ul className="relative grid gap-5 xl:grid-cols-2">
        {highlights.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
              <Icon className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm opacity-95">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <BrandPanel />
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Logo />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">{children}</div>
        </main>
        <footer className="px-4 py-6 sm:px-8">
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {footerLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-foreground">
                {l.label}
              </Link>
            ))}
            <span>© {new Date().getFullYear()} Campus Event Hub</span>
          </nav>
        </footer>
      </div>
    </div>
  );
}
