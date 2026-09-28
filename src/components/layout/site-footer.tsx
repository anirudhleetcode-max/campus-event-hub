import Link from "next/link";
import { Logo } from "./logo";

const cols = [
  { title: "Product", links: [{ href: "/events", label: "Explore events" }, { href: "/#features", label: "Features" }, { href: "/#how-it-works", label: "How it works" }, { href: "/verify", label: "Verify a certificate" }] },
  { title: "For colleges", links: [{ href: "/signup", label: "Create an account" }, { href: "/login", label: "Organizer login" }, { href: "/about", label: "About the platform" }, { href: "/#faq", label: "FAQ" }] },
  { title: "Legal", links: [{ href: "/privacy", label: "Privacy policy" }, { href: "/terms", label: "Terms of service" }] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            One platform for the complete college event lifecycle — from the first draft to the final certificate.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h2 className="text-sm font-semibold">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Campus Event Hub. All rights reserved.</p>
          <p>Payments secured by Razorpay · Made for Indian colleges</p>
        </div>
      </div>
    </footer>
  );
}
