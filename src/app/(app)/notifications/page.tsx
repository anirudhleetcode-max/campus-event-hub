import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { NotificationType } from "@prisma/client";
import {
  AlertTriangle, Award, BadgeCheck, Bell, BellOff, CalendarClock, CalendarX2, CheckCircle2, CreditCard, MapPin, Megaphone, MessageSquareText, RotateCcw, ShieldCheck, type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { listNotifications } from "@/server/services/communications";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { FilterPills } from "@/components/student/filter-pills";
import { MarkAllReadButton, MarkReadButton, NotificationLink } from "@/components/student/notification-actions";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const TYPE_META: Record<NotificationType, { icon: LucideIcon; cls: string; label: string }> = {
  REGISTRATION_CONFIRMED: { icon: BadgeCheck, cls: "bg-success-soft text-success-soft-foreground", label: "Registration" },
  PAYMENT_CONFIRMED: { icon: CreditCard, cls: "bg-success-soft text-success-soft-foreground", label: "Payment" },
  PAYMENT_FAILED: { icon: AlertTriangle, cls: "bg-danger-soft text-danger-soft-foreground", label: "Payment" },
  REFUND_UPDATE: { icon: RotateCcw, cls: "bg-info-soft text-info-soft-foreground", label: "Refund" },
  EVENT_UPDATE: { icon: Bell, cls: "bg-primary-soft text-primary-soft-foreground", label: "Event update" },
  EVENT_REMINDER: { icon: CalendarClock, cls: "bg-warning-soft text-warning-soft-foreground", label: "Reminder" },
  VENUE_CHANGE: { icon: MapPin, cls: "bg-warning-soft text-warning-soft-foreground", label: "Venue change" },
  EVENT_CANCELLED: { icon: CalendarX2, cls: "bg-danger-soft text-danger-soft-foreground", label: "Cancelled" },
  ATTENDANCE_CONFIRMED: { icon: CheckCircle2, cls: "bg-success-soft text-success-soft-foreground", label: "Attendance" },
  CERTIFICATE_AVAILABLE: { icon: Award, cls: "bg-accent-soft text-accent-soft-foreground", label: "Certificate" },
  FEEDBACK_REQUEST: { icon: MessageSquareText, cls: "bg-primary-soft text-primary-soft-foreground", label: "Feedback" },
  ANNOUNCEMENT: { icon: Megaphone, cls: "bg-info-soft text-info-soft-foreground", label: "Announcement" },
  EVENT_APPROVAL: { icon: ShieldCheck, cls: "bg-primary-soft text-primary-soft-foreground", label: "Approval" },
};

/** Only same-site relative links are rendered as click-throughs. */
const safeLink = (link: string | null) => (link && link.startsWith("/") && !link.startsWith("//") ? link : null);

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const filter = sp.filter === "unread" ? "unread" : "all";
  const { items, unread } = await listNotifications(user, { filter, take: 100 });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        description={
          <span className="flex flex-wrap items-center gap-3">
            <span>{unread > 0 ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.` : "You're all caught up."}</span>
            <LiveRefresh topics={[`user:${user.id}`]} debounceMs={800} />
          </span>
        }
        actions={<MarkAllReadButton disabled={unread === 0} />}
      />

      <FilterPills
        label="Filter notifications"
        active={filter}
        items={[
          { value: "all", label: "All", href: "/notifications" },
          { value: "unread", label: "Unread", href: "/notifications?filter=unread", count: unread },
        ]}
      />

      <Card className="mt-5 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            description={
              filter === "unread"
                ? "Nice — you've read everything. Switch to All to see older notifications."
                : "Updates about registrations, payments, reminders and certificates will appear here."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const meta = TYPE_META[n.type];
              const Icon = meta.icon;
              const isUnread = !n.readAt;
              const href = safeLink(n.link);
              const body = (
                <>
                  <p className={cn("text-sm break-words", isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>{n.title}</p>
                  <p className="mt-0.5 line-clamp-3 text-sm break-words text-muted-foreground">{n.body}</p>
                </>
              );
              return (
                <li key={n.id} className={cn("relative flex gap-3 px-4 py-4 sm:px-5", isUnread && "bg-primary-soft/35")}>
                  {isUnread && <span className="absolute top-0 bottom-0 left-0 w-0.5 bg-primary" aria-hidden />}
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", meta.cls)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    {href ? (
                      <NotificationLink id={n.id} href={href} unread={isUnread} className="block rounded-md hover:[&>p:first-child]:text-primary">
                        {body}
                      </NotificationLink>
                    ) : (
                      body
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{meta.label}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={n.createdAt.toISOString()} title={formatDateTime(n.createdAt)}>
                        {relativeTime(n.createdAt)}
                      </time>
                      {isUnread && <span className="sr-only">· Unread</span>}
                    </p>
                  </div>
                  {isUnread && (
                    <div className="shrink-0">
                      <MarkReadButton id={n.id} title={n.title} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
