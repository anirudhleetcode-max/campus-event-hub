import type { Metadata } from "next";
import Link from "next/link";
import { QrCode, Download } from "lucide-react";
import { pageUser, sp, type SearchParams } from "@/server/page-guard";
import { staffEventScope } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PageHeader, EmptyState, Progress, StatCard } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { UrlSelect } from "@/components/ui/url-controls";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendanceOverview({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const when = sp(params, "when") ?? "recent";
  const now = new Date();
  const events = await db.event.findMany({
    where: {
      AND: [
        staffEventScope(user),
        { status: { in: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING", "COMPLETED", "PUBLISHED"] } },
        when === "upcoming" ? { startsAt: { gte: now } } : when === "past" ? { endsAt: { lt: now } } : { startsAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } },
      ],
    },
    orderBy: { startsAt: when === "upcoming" ? "asc" : "desc" },
    take: 50,
    select: { id: true, title: true, startsAt: true, status: true, college: { select: { shortName: true } } },
  });
  const ids = events.map((e) => e.id);
  const [regs, att] = await Promise.all([
    db.registration.groupBy({ by: ["eventId"], where: { eventId: { in: ids }, status: "CONFIRMED" }, _count: { _all: true } }),
    db.attendance.groupBy({ by: ["eventId"], where: { eventId: { in: ids } }, _count: { _all: true } }),
  ]);
  const reg = new Map(regs.map((r) => [r.eventId, r._count._all]));
  const chk = new Map(att.map((r) => [r.eventId, r._count._all]));
  const totalReg = [...reg.values()].reduce((a, b) => a + b, 0);
  const totalChk = [...chk.values()].reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Check-in coverage across events. Open an event for the live dashboard and QR scanner."
        actions={
          <>
            <UrlSelect param="when" label="Period" options={[{ value: "recent", label: "Last 60 days" }, { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} allLabel={null} />
            <a href="/api/exports/attendance" className={buttonClasses("outline")}>
              <Download /> Export CSV
            </a>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Registered (these events)" value={formatNumber(totalReg)} />
        <StatCard label="Checked in" value={formatNumber(totalChk)} />
        <StatCard label="Attendance rate" value={formatPercent(totalReg ? totalChk / totalReg : 0)} />
      </div>
      <Card>
        {events.length === 0 ? (
          <EmptyState icon={QrCode} title="No events in this period" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH className="text-right">Registered</TH>
                <TH className="text-right">Checked in</TH>
                <TH className="w-48">Rate</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {events.map((e) => {
                const r = reg.get(e.id) ?? 0;
                const c = chk.get(e.id) ?? 0;
                return (
                  <TR key={e.id}>
                    <TD>
                      <p className="line-clamp-1 min-w-44 font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.college.shortName} · {formatDate(e.startsAt)}
                      </p>
                    </TD>
                    <TD>
                      <EventStatusBadge status={e.status} />
                    </TD>
                    <TD className="text-right tabular-nums">{r}</TD>
                    <TD className="text-right tabular-nums">{c}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress value={r ? c / r : 0} tone="success" label={`${e.title} attendance`} />
                        <span className="w-10 text-right text-xs tabular-nums">{formatPercent(r ? c / r : 0)}</span>
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Link href={`/organizer/events/${e.id}/attendance`} className={buttonClasses("ghost", "sm")}>
                        Open
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
