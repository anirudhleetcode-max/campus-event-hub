import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { db } from "@/server/db";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/url-controls";
import { formatDate, formatNumber } from "@/lib/utils";
import { pageParam, param, requireStaff } from "@/app/(app)/organizer/_lib/guard";
import { countBy, scopedEventPage } from "@/app/(app)/organizer/_lib/event-hub";

export const metadata: Metadata = { title: "Certificates" };

export default async function OrganizerCertificatesPage({ searchParams }: PageProps<"/organizer/certificates">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = param(sp.q);
  const data = await scopedEventPage(user, { q, page: pageParam(sp.page), where: { status: { in: ["ONGOING", "COMPLETED", "ARCHIVED", "REGISTRATION_CLOSED"] } } });
  const ids = data.items.map((e) => e.id);
  const [checkedIn, certs] = await Promise.all([
    countBy("attendance", ids),
    ids.length ? db.certificate.groupBy({ by: ["eventId", "status"], where: { eventId: { in: ids } }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const count = (eventId: string, status: "ISSUED" | "REVOKED") => certs.find((c) => c.eventId === eventId && c.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader title="Certificates" description="Issue and track certificates for events that have taken place." />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput placeholder="Search events…" label="Search events" className="sm:max-w-xs" />
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={Award} title={q ? "No events match your search" : "No events ready for certificates"} description="Certificates can be issued once an event has started." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH className="text-right">Checked in</TH>
                <TH className="text-right">Issued</TH>
                <TH className="text-right">Revoked</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((e) => {
                const issued = count(e.id, "ISSUED");
                const att = checkedIn.get(e.id) ?? 0;
                return (
                  <TR key={e.id}>
                    <TD className="max-w-[22rem] min-w-[14rem]">
                      <Link href={`/organizer/events/${e.id}/certificates`} className="line-clamp-2 font-medium hover:text-primary">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(e.startsAt)}</p>
                    </TD>
                    <TD>
                      <EventStatusBadge status={e.status} />
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(att)}</TD>
                    <TD className="text-right tabular-nums">
                      {formatNumber(issued)}
                      {att > 0 && issued === 0 && <p className="text-xs text-warning-soft-foreground">Not issued yet</p>}
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(count(e.id, "REVOKED"))}</TD>
                    <TD className="text-right">
                      <Link href={`/organizer/events/${e.id}/certificates`} className={buttonClasses("ghost", "sm")}>
                        {user.role === "FACULTY_COORDINATOR" ? "View" : "Manage"}
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {data.total > 0 && (
          <div className="border-t border-border p-4">
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath="/organizer/certificates" searchParams={sp} />
          </div>
        )}
      </Card>
    </>
  );
}
