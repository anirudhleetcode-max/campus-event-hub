import type { Metadata } from "next";
import Link from "next/link";
import { QrCode, UserCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Progress } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/url-controls";
import { formatDateRange, formatNumber, formatPercent } from "@/lib/utils";
import { pageParam, param, requireStaff } from "@/app/(app)/organizer/_lib/guard";
import { countBy, scopedEventPage } from "@/app/(app)/organizer/_lib/event-hub";

export const metadata: Metadata = { title: "Attendance" };

export default async function OrganizerAttendancePage({ searchParams }: PageProps<"/organizer/attendance">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = param(sp.q);
  const data = await scopedEventPage(user, {
    q,
    page: pageParam(sp.page),
    where: { status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING", "COMPLETED", "ARCHIVED"] } },
  });
  const ids = data.items.map((e) => e.id);
  const [registered, checkedIn] = await Promise.all([countBy("registration", ids), countBy("attendance", ids)]);
  const canScan = user.role !== "FACULTY_COORDINATOR";

  return (
    <>
      <PageHeader title="Attendance" description="Check-in progress for each of your events. Open the live view or the scanner on event day." />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput placeholder="Search events…" label="Search events" className="sm:max-w-xs" />
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={UserCheck} title={q ? "No events match your search" : "No published events yet"} description="Attendance appears here once your events are published." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH className="text-right">Registered</TH>
                <TH className="text-right">Checked in</TH>
                <TH>Attendance</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((e) => {
                const reg = registered.get(e.id) ?? 0;
                const att = checkedIn.get(e.id) ?? 0;
                const rate = reg ? att / reg : 0;
                return (
                  <TR key={e.id}>
                    <TD className="max-w-[22rem] min-w-[14rem]">
                      <Link href={`/organizer/events/${e.id}/attendance`} className="line-clamp-2 font-medium hover:text-primary">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDateRange(e.startsAt, e.endsAt)}</p>
                    </TD>
                    <TD>
                      <EventStatusBadge status={e.status} />
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(reg)}</TD>
                    <TD className="text-right tabular-nums">{formatNumber(att)}</TD>
                    <TD className="min-w-[9rem]">
                      <div className="flex items-center gap-2">
                        <Progress value={rate} tone="success" className="w-20" label={`${e.title} attendance`} />
                        <span className="text-xs tabular-nums text-muted-foreground">{formatPercent(rate)}</span>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Link href={`/organizer/events/${e.id}/attendance`} className={buttonClasses("ghost", "sm")}>
                          Live view
                        </Link>
                        {canScan && (e.status === "ONGOING" || e.status === "REGISTRATION_CLOSED" || e.status === "REGISTRATION_OPEN" || e.status === "PUBLISHED") && (
                          <Link href={`/organizer/events/${e.id}/scan`} className={buttonClasses("soft", "sm")}>
                            <QrCode /> Scan
                          </Link>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {data.total > 0 && (
          <div className="border-t border-border p-4">
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath="/organizer/attendance" searchParams={sp} />
          </div>
        )}
      </Card>
    </>
  );
}
