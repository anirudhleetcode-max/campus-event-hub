import type { Metadata } from "next";
import Link from "next/link";
import { Download, QrCode, Users } from "lucide-react";
import { attendanceSummary } from "@/server/services/attendance";
import { listEventRegistrations } from "@/server/services/registrations";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { PaymentStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { LiveAttendance, UndoCheckInButton } from "@/components/organizer/live-attendance";
import { formatDateTime } from "@/lib/utils";
import { guarded, loadStaffEvent, pageParam, param } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Attendance" };

export default async function EventAttendancePage({ params, searchParams }: PageProps<"/organizer/events/[id]/attendance">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  const { access } = ev.data;
  if (!access.canView) return <ForbiddenState message="Volunteers can only use the check-in scanner for this event." backHref={`/organizer/events/${id}/scan`} backLabel="Open scanner" />;

  const attendance = param(sp.attendance);
  const res = await guarded(() =>
    Promise.all([
      attendanceSummary(user, id),
      listEventRegistrations(user, id, {
        q: param(sp.q),
        status: "CONFIRMED",
        attendance: attendance === "present" || attendance === "absent" ? attendance : undefined,
        page: pageParam(sp.page),
        pageSize: 30,
      }),
    ]),
  );
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const [summary, list] = res.data;
  const filtered = Boolean(sp.q || sp.attendance);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live attendance</h2>
          <p className="text-sm text-muted-foreground">Check-ins update in real time as passes are scanned.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.canScan && (
            <Link href={`/organizer/events/${id}/scan`} className={buttonClasses("primary", "sm")}>
              <QrCode /> Open scanner
            </Link>
          )}
          <a href={`/api/exports/attendance?eventId=${id}`} className={buttonClasses("outline", "sm")} download>
            <Download /> Export CSV
          </a>
        </div>
      </div>

      <LiveAttendance
        eventId={id}
        initial={{
          registered: summary.registered,
          checkedIn: summary.checkedIn,
          recent: summary.recent.map((r) => ({
            name: r.registration.participantName,
            code: r.registration.code,
            at: r.checkInAt.toISOString(),
            method: r.method,
            by: r.markedBy.name,
          })),
        }}
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-3 border-y border-border p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Search name, email or REG-ID…" label="Search participants" className="sm:max-w-sm sm:flex-1" />
          <UrlSelect
            param="attendance"
            label="Attendance status"
            options={[
              { value: "present", label: "Checked in" },
              { value: "absent", label: "Not checked in" },
            ]}
            allLabel="Everyone"
          />
        </div>
        {list.items.length === 0 ? (
          <EmptyState icon={Users} title={filtered ? "No participants match your filters" : "No confirmed participants yet"} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Registration ID</TH>
                <TH>Payment</TH>
                <TH>Attendance</TH>
                <TH>Check-in time</TH>
                {access.canManage && (
                  <TH className="w-20">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </tr>
            </THead>
            <TBody>
              {list.items.map((r) => (
                <TR key={r.id}>
                  <TD className="min-w-[12rem]">
                    <p className="font-medium">{r.participantName}</p>
                    <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.participantEmail}</p>
                  </TD>
                  <TD className="font-mono text-xs whitespace-nowrap">{r.code}</TD>
                  <TD>{r.payments[0] ? <PaymentStatusBadge status={r.payments[0].status} /> : <span className="text-xs text-muted-foreground">Free</span>}</TD>
                  <TD>
                    {r.attendance ? (
                      <Badge tone="success" dot>
                        Present{r.attendance.method === "MANUAL" ? " (manual)" : ""}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Not checked in</Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{r.attendance ? formatDateTime(r.attendance.checkInAt) : "—"}</TD>
                  {access.canManage && (
                    <TD className="text-right">{r.attendance && <UndoCheckInButton eventId={id} registrationId={r.id} name={r.participantName} />}</TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {list.total > 0 && (
          <div className="border-t border-border p-4">
            <Pagination page={list.page} pageCount={list.pageCount} total={list.total} pageSize={list.pageSize} basePath={`/organizer/events/${id}/attendance`} searchParams={sp} />
          </div>
        )}
      </Card>
    </div>
  );
}
