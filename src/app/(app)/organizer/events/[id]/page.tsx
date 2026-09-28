import type { Metadata } from "next";
import { Activity, ClipboardList, IndianRupee, UserCheck } from "lucide-react";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { seatsTaken } from "@/server/services/events";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, StatCard } from "@/components/ui/misc";
import { LiveSeats } from "@/components/realtime/live-seats";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { StaffManager, type StaffMember } from "@/components/organizer/staff-manager";
import { AnnouncementForm } from "@/components/organizer/announcement-form";
import { formatAmount } from "@/components/organizer/format";
import { EVENT_MODE, EVENT_STATUS, REGISTRATION_FIELDS, type RegistrationField } from "@/lib/labels";
import { formatDateTime, formatNumber, formatPercent, relativeTime } from "@/lib/utils";
import { loadStaffEvent } from "../../../_lib/guard";

export const metadata: Metadata = { title: "Event overview" };

const ACTIVITY_LABEL: Record<string, string> = {
  "event.created": "created the event",
  "event.updated": "updated the event details",
  "event.duplicated": "created this event as a copy",
  "event.submit": "submitted the event for approval",
  "event.approve": "approved and published the event",
  "event.reject": "sent the event back to draft",
  "event.publish": "published the event",
  "event.unpublish": "unpublished the event",
  "event.openRegistration": "opened registration",
  "event.closeRegistration": "closed registration",
  "event.start": "marked the event as ongoing",
  "event.complete": "marked the event as completed",
  "event.cancel": "cancelled the event",
  "event.archive": "archived the event",
  "event.auto_status": "status changed automatically",
  "event.staff_added": "added a staff member",
  "event.staff_removed": "removed a staff member",
  "certificate.issued": "issued certificates",
  "attendance.invalid_qr": "scanned an invalid QR pass",
  "registration.bulk_cancelled": "cancelled all active registrations",
  "export.csv": "exported data",
};

function activityText(action: string, metadata: unknown): string {
  const base = ACTIVITY_LABEL[action] ?? action.replace(/[._]/g, " ");
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  if (action === "event.auto_status" && typeof meta.to === "string" && meta.to in EVENT_STATUS) {
    return `Status changed automatically to ${EVENT_STATUS[meta.to as keyof typeof EVENT_STATUS].label.toLowerCase()}`;
  }
  if (action === "certificate.issued" && typeof meta.count === "number") return `issued ${meta.count} certificate${meta.count === 1 ? "" : "s"}`;
  if (action === "export.csv" && typeof meta.kind === "string") return `exported ${meta.kind} as CSV`;
  return base;
}

export default async function EventOverviewPage({ params }: PageProps<"/organizer/events/[id]">) {
  const { id } = await params;
  const { user, res } = await loadStaffEvent(id);
  if (!res.ok) return null; // the layout renders the forbidden state
  const { event, access } = res.data;
  if (!access.canView) return <ForbiddenState message="Volunteers can only use the check-in scanner for this event." backHref={`/organizer/events/${id}/scan`} backLabel="Open scanner" />;

  const [registered, taken, revenue, attendance, logs] = await Promise.all([
    db.registration.count({ where: { eventId: id, status: "CONFIRMED" } }),
    seatsTaken(id),
    db.payment.aggregate({ where: { eventId: id, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { amount: true, refundAmount: true } }),
    db.attendance.count({ where: { eventId: id } }),
    db.auditLog.findMany({
      where: { entityType: "event", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, action: true, metadata: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);
  const net = (revenue._sum.amount ?? 0) - (revenue._sum.refundAmount ?? 0);
  const staff: StaffMember[] = event.volunteers.map((v) => ({ userId: v.user.id, name: v.user.name, email: v.user.email, role: v.role, canScan: v.canScan }));
  const canAnnounce = access.canManage && can(user, "announcements:send");
  const now = new Date();

  return (
    <div className="space-y-6">
      {event.status === "PENDING_APPROVAL" && (
        <Alert tone="warning" title="Awaiting approval">
          {access.canApprove
            ? "Review the details below, then approve & publish or send it back to the organizer with a note."
            : "A college administrator will review this event. You'll be notified once it's approved."}
        </Alert>
      )}
      {event.status === "DRAFT" && event.reviewNote && (
        <Alert tone="warning" title="Changes requested by the reviewer">
          {event.reviewNote}
        </Alert>
      )}
      {event.status === "CANCELLED" && (
        <Alert tone="danger" title={`Cancelled${event.cancelledAt ? ` on ${formatDateTime(event.cancelledAt)}` : ""}`}>
          {event.cancelReason ?? "No reason was recorded."}
        </Alert>
      )}

      <div className="flex items-center justify-end">
        <LiveRefresh topics={[`event:${id}:stats`]} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered" value={formatNumber(registered)} icon={ClipboardList} hint={taken > registered ? `+${taken - registered} awaiting payment` : "Confirmed"} />
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <p className="mb-3 text-sm font-medium text-muted-foreground">Remaining seats</p>
          <LiveSeats eventId={id} capacity={event.capacity} initialTaken={taken} />
        </div>
        <StatCard label="Revenue" value={event.feeAmount === 0 && net === 0 ? "Free event" : formatAmount(net)} icon={IndianRupee} hint={event.feeAmount ? `${formatAmount(event.feeAmount)} per seat` : undefined} />
        <StatCard label="Attendance" value={formatNumber(attendance)} icon={UserCheck} hint={registered ? `${formatPercent(attendance / registered)} checked in` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Event details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Organizer", value: event.organizer.name },
                  { label: "College", value: event.college.name },
                  { label: "Department", value: event.department?.name ?? "—" },
                  { label: "Mode", value: EVENT_MODE[event.mode] },
                  ...(event.mode !== "ONLINE" ? [{ label: "Venue", value: [event.venueName, event.venueAddress, event.city].filter(Boolean).join(", ") || "—" }] : []),
                  ...(event.mode !== "IN_PERSON" ? [{ label: "Meeting link", value: event.onlineUrl ?? "—" }] : []),
                  { label: "Registration opens", value: event.registrationOpensAt ? formatDateTime(event.registrationOpensAt) : "On publish" },
                  { label: "Registration deadline", value: formatDateTime(event.registrationDeadline) },
                  { label: "Capacity", value: formatNumber(event.capacity) },
                  { label: "Fee", value: event.feeAmount ? formatAmount(event.feeAmount, event.currency) : "Free" },
                  {
                    label: "Required details",
                    value: event.requiredFields.length ? event.requiredFields.map((f) => REGISTRATION_FIELDS[f as RegistrationField] ?? f).join(", ") : "None",
                  },
                  { label: "Custom questions", value: formatNumber(event.questions.length) },
                  ...(event.tags.length ? [{ label: "Tags", value: event.tags.map((t) => `#${t}`).join(" ") }] : []),
                ]}
              />
            </CardContent>
          </Card>

          {canAnnounce && (
            <Card>
              <CardHeader>
                <CardTitle>Message participants</CardTitle>
                <CardDescription>Sends a notification to everyone with a confirmed registration.</CardDescription>
              </CardHeader>
              <CardContent>
                <AnnouncementForm eventId={id} participantCount={registered} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Event staff</CardTitle>
              <CardDescription>Volunteers can scan passes; co-organizers can manage the event; faculty coordinators get read-only access.</CardDescription>
            </CardHeader>
            <CardContent>
              <StaffManager eventId={id} staff={staff} canManage={access.canManage} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {logs.map((l) => (
                    <li key={l.id} className="relative text-sm">
                      <span className="absolute top-1.5 -left-[1.4rem] flex size-2.5 rounded-full bg-primary ring-4 ring-surface" aria-hidden />
                      <p>
                        <span className="font-medium">{l.actor?.name ?? "System"}</span> {activityText(l.action, l.metadata)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <time dateTime={l.createdAt.toISOString()} title={formatDateTime(l.createdAt)}>
                          {relativeTime(l.createdAt, now)}
                        </time>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="size-3.5" aria-hidden /> Showing the latest {logs.length} changes to this event.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
