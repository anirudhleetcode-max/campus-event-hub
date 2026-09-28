"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markReadAction } from "@/app/actions/notifications";

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      loading={pending}
      disabled={disabled}
      onClick={() =>
        startTransition(async () => {
          const res = await markReadAction("all");
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("All notifications marked as read");
          router.refresh();
        })
      }
    >
      {!pending && <CheckCheck aria-hidden />}
      Mark all as read
    </Button>
  );
}

export function MarkReadButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      aria-label={`Mark "${title}" as read`}
      onClick={() =>
        startTransition(async () => {
          const res = await markReadAction([id]);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {!pending && <Check aria-hidden />}
      <span className="hidden sm:inline">Mark as read</span>
    </Button>
  );
}

/** Link that also marks the notification as read (fire-and-forget) when followed. */
export function NotificationLink({ id, href, unread, className, children }: { id: string; href: string; unread: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (unread) void markReadAction([id]);
      }}
    >
      {children}
    </Link>
  );
}
