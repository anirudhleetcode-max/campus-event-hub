"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Events" },
  { href: "/about", label: "About" },
  { href: "/#how-it-works", label: "How It Works" },
];

export function SiteHeader({ user }: { user: { name: string; home: string } | null }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : !href.includes("#") && pathname.startsWith(href));
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={cn("rounded-md px-3 py-2 text-sm font-medium transition-colors", isActive(l.href) ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {user ? (
            <Link href={user.home} className={buttonClasses("primary", "sm")}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonClasses("ghost", "sm")}>
                Log in
              </Link>
              <Link href="/signup" className={buttonClasses("primary", "sm")}>
                Get Started
              </Link>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <D.Root open={open} onOpenChange={setOpen}>
            <D.Trigger className="rounded-lg p-2 hover:bg-surface-2" aria-label="Open menu">
              <Menu className="size-5" />
            </D.Trigger>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
              <D.Content className="fixed inset-x-0 top-0 z-50 border-b border-border bg-surface p-4 shadow-lg">
                <D.Title className="sr-only">Menu</D.Title>
                <D.Description className="sr-only">Site navigation</D.Description>
                <div className="flex items-center justify-between">
                  <Logo />
                  <D.Close className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close menu">
                    <X className="size-5" />
                  </D.Close>
                </div>
                <ul className="mt-4 space-y-1">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-base font-medium hover:bg-surface-2">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 grid gap-2 border-t border-border pt-4">
                  {user ? (
                    <Link href={user.home} onClick={() => setOpen(false)} className={buttonClasses("primary", "md")}>
                      Go to dashboard
                    </Link>
                  ) : (
                    <>
                      <Link href="/login" onClick={() => setOpen(false)} className={buttonClasses("outline", "md")}>
                        Log in
                      </Link>
                      <Link href="/signup" onClick={() => setOpen(false)} className={buttonClasses("primary", "md")}>
                        Get Started
                      </Link>
                    </>
                  )}
                </div>
              </D.Content>
            </D.Portal>
          </D.Root>
        </div>
      </div>
    </header>
  );
}
