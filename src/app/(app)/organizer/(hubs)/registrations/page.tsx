import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ClipboardList, Download } from "lucide-react";
import { staffEventScope } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { PaymentStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { REGISTRATION_STATUS } from "@/lib/labels";
import { formatDate, formatTime } from "@/lib/utils";
import { isUuid, pageParam, param, requireStaff } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Registrations" };

const PAGE_SIZE = 25;
const STATUS_OPTIONS = Object.entries(REGISTRATION_STATUS).map(([value, s]) => ({ value, label: s.label }));

export default async function OrganizerRegistrationsPage({ searchParams }: PageProps<"/organizer/registrations">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const scope = staffEventScope(user);
  const eventId = param(sp.event);
  const status = param(sp.status);
  const q = param(sp.q)?.slice(0, 100);
  const page = pageParam(sp.page);

  const where: Prisma.RegistrationWhereInput = {
    event: scope,
    ...(isUuid(eventId) ? { eventId } : {}),
    ...(status && status in REGISTRATION_STATUS ? { status: status as keyof typeof REGISTRATION_STATUS } : {}),
    ...(q
      ? {
          OR: [
            { participantName: { contains: q, mode: "insensitive" } },
            { participantEmail: { contains: q, mode: "insensitive" } },
            { code: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  };
  const [events, total, items] = await Promise.all([
    db.event.findMany({ where: scope, orderBy: { startsAt: "desc" }, take: 200, select: { id: true, title: true } }),
    db.registration.count({ where }),
    db.registration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, code: true, participantName: true, participantEmail: true, status: true, createdAt: true,
        event: { select: { id: true, title: true } },
        attendance: { select: { checkInAt: true } },
        payments: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(q || status || eventId);
  const selectedEvent = isUuid(eventId) ? events.find((e) => e.id === eventId) : undefined;

  return (
    <>
      <PageHeader
        title="Registrations"
        description="Recent registrations across all your events."
        actions={
          selectedEvent ? (
            <a href={`/api/exports/registrations?eventId=${selectedEvent.id}`} className={buttonClasses("outline", "sm")} download>
              <Download /> Export CSV
            </a>
          ) : undefined
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search name, email or REG-ID…" label="Search registrations" className="lg:max-w-sm lg:flex-1" />
          <div className="flex flex-wrap gap-3">
            <UrlSelect param="event" label="Event" options={events.map((e) => ({ value: e.id, label: e.title.length > 48 ? `${e.title.slice(0, 47)}…` : e.title }))} allLabel="All events" className="max-w-full sm:max-w-xs" />
            <UrlSelect param="status" label="Registration status" options={STATUS_OPTIONS} allLabel="All statuses" />
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={filtered ? "No registrations match your filters" : "No registrations yet"}
            description={filtered ? "Try a different search or filter." : "Registrations for your events will appear here."}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Participant</TH>
                <TH>Event</TH>
                <TH>Registration ID</TH>
                <TH>Status</TH>
                <TH>Payment</TH>
                <TH>Registered</TH>
                <TH>Attendance</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((r) => (
                <TR key={r.id}>
                  <TD className="min-w-[12rem]">
                    <p className="font-medium">{r.participantName}</p>
                    <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.participantEmail}</p>
                  </TD>
                  <TD className="max-w-[16rem] min-w-[12rem]">
                    <Link href={`/organizer/events/${r.event.id}/registrations?q=${encodeURIComponent(r.code)}`} className="line-clamp-2 hover:text-primary">
                      {r.event.title}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs whitespace-nowrap">{r.code}</TD>
                  <TD>
                    <RegistrationStatusBadge status={r.status} />
                  </TD>
                  <TD>{r.payments[0] ? <PaymentStatusBadge status={r.payments[0].status} /> : <span className="text-xs text-muted-foreground">—</span>}</TD>
                  <TD className="whitespace-nowrap">
                    <p>{formatDate(r.createdAt, { day: "numeric", month: "short", year: "numeric" })}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(r.createdAt)}</p>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {r.attendance ? (
                      <Badge tone="success" dot>
                        {formatTime(r.attendance.checkInAt)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {total > 0 && (
          <div className="border-t border-border p-4">
            <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} basePath="/organizer/registrations" searchParams={sp} />
          </div>
        )}
      </Card>
    </>
  );
}
