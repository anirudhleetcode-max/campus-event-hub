"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { Menu, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/labels";
import { Logo } from "./logo";
import { navFor, homeFor, type NavGroup } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

type ShellUser = { id: string; name: string; email: string; role: Role; avatarUrl: string | null; collegeName: string | null };

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-6">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ user }: { user: ShellUser }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 p-3 text-xs">
      <p className="font-semibold text-foreground">{ROLE_LABEL[user.role]}</p>
      <p className="mt-0.5 truncate text-muted-foreground">{user.collegeName ?? "Platform"}</p>
    </div>
  );
}

export function AppShell({ user, unread, banner, children }: { user: ShellUser; unread: number; banner?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const groups = navFor(user.role);
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo href={homeFor(user.role)} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList groups={groups} />
        </div>
        <div className="p-3">
          <SidebarFooter user={user} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur sm:px-6">
          <D.Root open={open} onOpenChange={setOpen}>
            <D.Trigger className="rounded-lg p-2 hover:bg-surface-2 lg:hidden" aria-label="Open navigation">
              <Menu className="size-5" />
            </D.Trigger>
            <D.Portal>
              <D.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
              <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-72 flex-col border-r border-border bg-surface shadow-lg lg:hidden">
                <D.Title className="sr-only">Navigation</D.Title>
                <D.Description className="sr-only">Main navigation menu</D.Description>
                <div className="flex h-16 items-center justify-between px-4">
                  <Logo href={homeFor(user.role)} />
                  <D.Close className="rounded-lg p-2 hover:bg-surface-2" aria-label="Close navigation">
                    <X className="size-5" />
                  </D.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  <NavList groups={groups} onNavigate={() => setOpen(false)} />
                </div>
                <div className="p-3">
                  <SidebarFooter user={user} />
                </div>
              </D.Content>
            </D.Portal>
          </D.Root>
          <div className="lg:hidden">
            <Logo href={homeFor(user.role)} className="[&>span]:hidden sm:[&>span]:inline" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell userId={user.id} initialUnread={unread} />
            <UserMenu user={user} />
          </div>
        </header>
        {banner && (
          <div role="status" className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-sm text-warning-soft-foreground sm:px-6">
            {banner}
          </div>
        )}
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
