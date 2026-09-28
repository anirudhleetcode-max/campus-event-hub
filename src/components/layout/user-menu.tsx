"use client";

import Link from "next/link";
import { LogOut, UserRound, Home, CalendarDays } from "lucide-react";
import type { Role } from "@prisma/client";
import { Avatar } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ROLE_LABEL } from "@/lib/labels";
import { logoutAction } from "@/app/actions/auth";
import { homeFor } from "./nav-config";

export function UserMenu({ user }: { user: { name: string; email: string; role: Role; avatarUrl: string | null } }) {
  return (
    <Dropdown>
      <DropdownTrigger className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface-2" aria-label="Account menu">
        <Avatar name={user.name} src={user.avatarUrl} size={32} />
      </DropdownTrigger>
      <DropdownContent className="w-60">
        <DropdownLabel className="space-y-0.5 py-2">
          <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
          <p className="truncate text-xs">{user.email}</p>
          <p className="text-xs text-primary">{ROLE_LABEL[user.role]}</p>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href={homeFor(user.role)}>
            <Home /> Dashboard
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/events">
            <CalendarDays /> Browse events
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/profile">
            <UserRound /> Profile & security
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <form action={logoutAction}>
          <DropdownItem asChild destructive>
            <button type="submit" className="w-full">
              <LogOut /> Sign out
            </button>
          </DropdownItem>
        </form>
      </DropdownContent>
    </Dropdown>
  );
}
