"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

/** Bell with a live unread count pushed over SSE (topic user:<id>). */
export function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  useRealtime([`user:${userId}`], (_topic, data) => {
    if (data.kind === "notification" && typeof data.unread === "number") setUnread(data.unread);
  });
  return (
    <Link
      href="/notifications"
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-foreground hover:bg-surface-2"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface",
          )}
          aria-hidden
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
