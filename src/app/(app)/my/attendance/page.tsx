import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, CalendarX2, Percent, QrCode, ScanLine } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Progress, StatCard } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime, formatNumber, formatPercent, formatTime } from "@/lib/utils";

export const metadata: Metadata = { title: "My attendance" };

async function loadAttendance(userId: string) {
  const now = new Date();
  const [records, pastRegistered, pastAttended, missed] = await Promise.all([
    db.attendance.findMany({
      where: { userId },
      orderBy: { checkInAt: "desc" },
      take: 200,
      select: {
        id: true, checkInAt: true, checkOutAt: true, method: true, registrationId: true,
        event: { select: { title: true, slug: true, startsAt: true, college: { select: { shortName: true, name: true } } } },
      },
    }),
    db.registration.count({ where: { userId, status: "CONFIRMED", event: { endsAt: { lt: now } } } }),
    db.registration.count({ where: { userId, status: "CONFIRMED", event: { endsAt: { lt: now } }, attendance: { isNot: null } } }),
    db.registration.findMany({
      where: { userId, status: "CONFIRMED", event: { endsAt: { lt: now }, status: { not: "CANCELLED" } }, attendance: { is: null } },
      orderBy: { event: { startsAt: "desc" } },
      take: 5,
      select: { id: true, event: { select: { title: true, startsAt: true } } },
    }),
  ]);
  return { records, pastRegistered, pastAttended, missed };
}

export default async function MyAttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { records, pastRegistered, pastAttended, missed } = await loadAttendance(user.id);
  const rate = pastRegistered > 0 ? pastAttended / pastRegistered : 0;

  return (
    <>
      <PageHeader title="My attendance" description="Events you've checked in to, with your check-in times." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events attended" value={formatNumber(records.length)} icon={CalendarCheck2} />
        <StatCard label="Past events registered" value={formatNumber(pastRegistered)} icon={QrCode} hint="Confirmed registrations for ended events" />
        <StatCard label="Missed" value={formatNumber(Math.max(0, pastRegistered - pastAttended))} icon={CalendarX2} />
        <StatCard
          label="Attendance rate"
          value={pastRegistered > 0 ? formatPercent(rate) : "—"}
          icon={Percent}
          hint={pastRegistered > 0 ? <Progress value={rate} tone={rate >= 0.75 ? "success" : rate >= 0.5 ? "warning" : "danger"} className="w-24" label="Attendance rate" /> : "No past events yet"}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Check-in history</CardTitle>
        </CardHeader>
        {records.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="No check-ins yet"
            description="When you show your QR pass at an event, your attendance will be recorded here."
            action={
              <Link href="/my/registrations?status=upcoming" className={buttonClasses("primary")}>
                View upcoming passes
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Event date</TH>
                <TH>Checked in</TH>
                <TH>Checked out</TH>
                <TH>Method</TH>
              </tr>
            </THead>
            <TBody>
              {records.map((r) => (
                <TR key={r.id}>
                  <TD className="min-w-52">
                    <Link href={`/my/registrations/${r.registrationId}`} className="font-medium hover:text-primary">
                      {r.event.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{r.event.college.shortName ?? r.event.college.name}</p>
                  </TD>
                  <TD className="whitespace-nowrap">{formatDate(r.event.startsAt)}</TD>
                  <TD className="whitespace-nowrap">{formatDateTime(r.checkInAt)}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{r.checkOutAt ? formatTime(r.checkOutAt) : "—"}</TD>
                  <TD>
                    <Badge tone={r.method === "QR" ? "primary" : "neutral"}>{r.method === "QR" ? "QR scan" : "Manual"}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {missed.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recently missed</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {missed.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={`/my/registrations/${m.id}`} className="min-w-0 font-medium hover:text-primary">
                    {m.event.title}
                  </Link>
                  <span className="text-muted-foreground">{formatDate(m.event.startsAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
