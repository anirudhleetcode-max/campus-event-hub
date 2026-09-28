import type { Metadata } from "next";
import { Award, Download, ExternalLink } from "lucide-react";
import { db } from "@/server/db";
import { listEventCertificates } from "@/server/services/certificates";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, StatCard } from "@/components/ui/misc";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { CertificateIssuer, RevokeCertificateButton, type CertificateCandidate } from "@/components/organizer/certificate-issuer";
import { CERTIFICATE_TYPE } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils";
import { guarded, loadStaffEvent } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Certificates" };

const STAFF_ROLE: Record<string, string> = { VOLUNTEER: "Volunteer", CO_ORGANIZER: "Co-organizer", FACULTY_COORDINATOR: "Faculty coordinator" };

export default async function EventCertificatesPage({ params }: PageProps<"/organizer/events/[id]/certificates">) {
  const { id } = await params;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  const { access, event } = ev.data;
  if (!access.canView) return <ForbiddenState message="Volunteers can only use the check-in scanner for this event." backHref={`/organizer/events/${id}/scan`} backLabel="Open scanner" />;
  const res = await guarded(() => listEventCertificates(user, id));
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const certificates = res.data;
  const checkedIn = await db.attendance.count({ where: { eventId: id } });

  let candidates: CertificateCandidate[] = [];
  if (access.canManage) {
    const regs = await db.registration.findMany({
      where: { eventId: id, status: "CONFIRMED" },
      orderBy: { participantName: "asc" },
      select: { userId: true, participantName: true, code: true, attendance: { select: { id: true } } },
    });
    const seen = new Set(regs.map((r) => r.userId));
    candidates = [
      ...regs.map((r) => ({ userId: r.userId, name: r.participantName, detail: `${r.code}${r.attendance ? " · checked in" : " · not checked in"}`, checkedIn: Boolean(r.attendance), staff: false })),
      ...event.volunteers
        .filter((v) => !seen.has(v.userId))
        .map((v) => ({ userId: v.userId, name: v.user.name, detail: `${STAFF_ROLE[v.role] ?? v.role} · ${v.user.email}`, checkedIn: false, staff: true })),
    ];
  }
  const blockedReason =
    event.status === "CANCELLED"
      ? "Certificates can't be issued for a cancelled event."
      : event.startsAt > new Date()
        ? "Certificates can be issued once the event has started."
        : undefined;
  const issued = certificates.filter((c) => c.status === "ISSUED").length;
  const byType = Object.entries(CERTIFICATE_TYPE)
    .map(([t, label]) => ({ label, count: certificates.filter((c) => c.type === t && c.status === "ISSUED").length }))
    .filter((t) => t.count > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Certificates</h2>
          <p className="text-sm text-muted-foreground">Verifiable PDF certificates for participants, winners and staff.</p>
        </div>
        <a href={`/api/exports/certificates?eventId=${id}`} className={buttonClasses("outline", "sm")} download>
          <Download /> Export CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Issued" value={formatNumber(issued)} icon={Award} hint={byType.map((t) => `${t.count} ${t.label.toLowerCase()}`).join(" · ") || undefined} />
        <StatCard label="Revoked" value={formatNumber(certificates.length - issued)} />
        <StatCard label="Checked-in participants" value={formatNumber(checkedIn)} hint="Eligible for participation" />
        <StatCard label="Event staff" value={formatNumber(event.volunteers.length)} />
      </div>

      {access.canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Issue certificates</CardTitle>
            <CardDescription>Recipients are notified and can download their certificate from their dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <CertificateIssuer eventId={id} candidates={candidates} blockedReason={blockedReason} />
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Issued certificates</CardTitle>
        </CardHeader>
        {certificates.length === 0 ? (
          <EmptyState icon={Award} title="No certificates issued yet" description="Issued certificates will be listed here with download and verification links." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Recipient</TH>
                <TH>Type</TH>
                <TH>Certificate ID</TH>
                <TH>Status</TH>
                <TH>Issued</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {certificates.map((c) => (
                <TR key={c.id}>
                  <TD className="min-w-[12rem]">
                    <p className="font-medium">{c.recipientName}</p>
                    <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{c.user.email}</p>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {CERTIFICATE_TYPE[c.type]}
                    {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                  </TD>
                  <TD className="font-mono text-xs whitespace-nowrap">{c.code}</TD>
                  <TD>
                    {c.status === "ISSUED" ? (
                      <Badge tone="success">Valid</Badge>
                    ) : (
                      <Badge tone="danger" title={c.revokedReason ?? undefined}>
                        Revoked
                      </Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(c.issuedAt)}
                    <p className="text-xs text-muted-foreground">by {c.issuedBy.name}</p>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      {c.status === "ISSUED" && (
                        <a href={`/api/certificates/${c.code}/pdf`} className={buttonClasses("ghost", "sm")} aria-label={`Download certificate for ${c.recipientName}`}>
                          <Download /> PDF
                        </a>
                      )}
                      <a href={`/verify/${c.code}`} target="_blank" rel="noopener" className={buttonClasses("ghost", "sm")} aria-label={`Verify certificate ${c.code}`}>
                        <ExternalLink /> Verify
                      </a>
                      {access.canManage && c.status === "ISSUED" && <RevokeCertificateButton eventId={id} certificateId={c.id} name={c.recipientName} />}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
