import Link from "next/link";
import { CalendarDays, Download, ExternalLink, MapPin, Pencil } from "lucide-react";
import { can } from "@/server/auth/permissions";
import { buttonClasses } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/misc";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { TabNav } from "@/components/ui/tabs";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { EventHeaderActions } from "@/components/organizer/event-status-actions";
import { EDITABLE_STATUSES, PUBLIC_STATUSES } from "@/lib/event-status";
import { formatDateRange } from "@/lib/utils";
import { loadStaffEvent } from "@/app/(app)/organizer/_lib/guard";

export default async function EventStaffLayout({ children, params }: LayoutProps<"/organizer/events/[id]">) {
  const { id } = await params;
  const { user, res } = await loadStaffEvent(id);
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const { event, access } = res.data;
  const base = `/organizer/events/${event.id}`;
  const staffArea = can(user, "events:staff-area");

  const tabs = access.canView
    ? [
        { href: base, label: "Overview", exact: true },
        { href: `${base}/registrations`, label: "Registrations" },
        { href: `${base}/attendance`, label: "Attendance" },
        ...(access.canScan ? [{ href: `${base}/scan`, label: "Scan" }] : []),
        { href: `${base}/payments`, label: "Payments" },
        { href: `${base}/certificates`, label: "Certificates" },
        { href: `${base}/feedback`, label: "Feedback" },
        { href: `${base}/analytics`, label: "Analytics" },
      ]
    : [{ href: `${base}/scan`, label: "Scan" }];

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        {staffArea && (
          <Breadcrumbs
            items={[
              { label: "Events", href: user.role === "SUPER_ADMIN" || user.role === "COLLEGE_ADMIN" ? "/admin/events" : "/organizer/events" },
              { label: event.title },
            ]}
          />
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <EventStatusBadge status={event.status} />
              <span className="text-xs text-muted-foreground">{event.category.name}</span>
              {event.college && (user.role === "SUPER_ADMIN" || !staffArea) && <span className="text-xs text-muted-foreground">· {event.college.shortName ?? event.college.name}</span>}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-[1.7rem]">{event.title}</h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden /> {formatDateRange(event.startsAt, event.endsAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {event.mode === "ONLINE" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", ") || "Venue to be announced"}
              </span>
            </p>
          </div>
          {access.canView && (
            <div className="flex flex-wrap items-center gap-2">
              {PUBLIC_STATUSES.includes(event.status) && (
                <Link href={`/events/${event.slug}`} className={buttonClasses("ghost", "sm")} target="_blank" rel="noopener">
                  <ExternalLink /> Public page
                </Link>
              )}
              {access.canManage && EDITABLE_STATUSES.includes(event.status) && (
                <Link href={`${base}/edit`} className={buttonClasses("outline", "sm")}>
                  <Pencil /> Edit
                </Link>
              )}
              <a href={`/api/events/${event.id}/report`} className={buttonClasses("outline", "sm")} download>
                <Download /> Report (PDF)
              </a>
              <EventHeaderActions
                eventId={event.id}
                status={event.status}
                canManage={access.canManage}
                canApprove={access.canApprove}
                canCreate={can(user, "events:create")}
                requireApproval={event.college.requireEventApproval}
              />
            </div>
          )}
        </div>
        <TabNav items={tabs} />
      </header>
      <div>{children}</div>
    </div>
  );
}
