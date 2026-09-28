import type { Metadata } from "next";
import { ClipboardList, Download } from "lucide-react";
import { db } from "@/server/db";
import { listEventRegistrations } from "@/server/services/registrations";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { PaymentStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { RegistrationActions, type RegistrationDetails } from "@/components/organizer/registration-actions";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { CERTIFICATE_TYPE, REGISTRATION_STATUS } from "@/lib/labels";
import { formatDate, formatTime } from "@/lib/utils";
import { guarded, loadStaffEvent, pageParam, param } from "../../../../_lib/guard";

export const metadata: Metadata = { title: "Registrations" };

const STATUS_OPTIONS = Object.entries(REGISTRATION_STATUS).map(([value, s]) => ({ value, label: s.label }));

export default async function EventRegistrationsPage({ params, searchParams }: PageProps<"/organizer/events/[id]/registrations">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  const status = param(sp.status);
  const attendance = param(sp.attendance);
  const res = await guarded(() =>
    listEventRegistrations(user, id, {
      q: param(sp.q),
      status: status && status in REGISTRATION_STATUS ? status : undefined,
      attendance: attendance === "present" || attendance === "absent" ? attendance : undefined,
      page: pageParam(sp.page),
    }),
  );
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const data = res.data;
  const { access } = ev.data;

  const answers = data.items.length
    ? await db.registrationAnswer.findMany({
        where: { registrationId: { in: data.items.map((r) => r.id) } },
        select: { registrationId: true, value: true, question: { select: { label: true, position: true } } },
        orderBy: { question: { position: "asc" } },
      })
    : [];
  const filtered = Boolean(sp.q || sp.status || sp.attendance);
  const base = `/organizer/events/${id}/registrations`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Registrations</h2>
          <p className="text-sm text-muted-foreground">{data.total} matching registration{data.total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh topics={[`event:${id}:stats`]} />
          <a href={`/api/exports/registrations?eventId=${id}`} className={buttonClasses("outline", "sm")} download>
            <Download /> Export CSV
          </a>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search name, email or REG-ID…" label="Search registrations" className="lg:max-w-sm lg:flex-1" />
          <div className="flex flex-wrap gap-3">
            <UrlSelect param="status" label="Registration status" options={STATUS_OPTIONS} allLabel="All statuses" />
            <UrlSelect
              param="attendance"
              label="Attendance"
              options={[
                { value: "present", label: "Checked in" },
                { value: "absent", label: "Not checked in" },
              ]}
              allLabel="Any attendance"
            />
          </div>
        </div>
        {data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={filtered ? "No registrations match your filters" : "No registrations yet"}
            description={filtered ? "Try a different search or filter." : "Registrations will appear here as soon as participants sign up."}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Participant</TH>
                <TH>Registration ID</TH>
                <TH>Status</TH>
                <TH>Payment</TH>
                <TH>Registered</TH>
                <TH>Attendance</TH>
                <TH>Certificate</TH>
                <TH className="w-12">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((r) => {
                const payment = r.payments[0];
                const details: RegistrationDetails = {
                  id: r.id,
                  code: r.code,
                  participantName: r.participantName,
                  participantEmail: r.participantEmail,
                  participantPhone: r.participantPhone,
                  collegeName: r.collegeName,
                  departmentName: r.departmentName,
                  year: r.year,
                  studentId: r.studentId,
                  status: r.status,
                  amount: r.amount,
                  createdAt: r.createdAt,
                  confirmedAt: r.confirmedAt,
                  cancelReason: r.cancelReason,
                  checkInAt: r.attendance?.checkInAt ?? null,
                  checkInMethod: r.attendance?.method ?? null,
                  paymentStatus: payment?.status ?? null,
                  answers: answers.filter((a) => a.registrationId === r.id).map((a) => ({ label: a.question.label, value: a.value })),
                };
                return (
                  <TR key={r.id}>
                    <TD className="min-w-[12rem]">
                      <p className="font-medium">{r.participantName}</p>
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{r.participantEmail}</p>
                    </TD>
                    <TD className="font-mono text-xs whitespace-nowrap">{r.code}</TD>
                    <TD>
                      <RegistrationStatusBadge status={r.status} />
                    </TD>
                    <TD>{payment ? <PaymentStatusBadge status={payment.status} /> : <span className="text-xs text-muted-foreground">{r.amount ? "Not started" : "Free"}</span>}</TD>
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
                        <span className="text-xs text-muted-foreground">Not checked in</span>
                      )}
                    </TD>
                    <TD>
                      {r.certificates.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.certificates.map((c) => (
                            <Badge key={c.code} tone="primary">
                              {CERTIFICATE_TYPE[c.type]}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <RegistrationActions eventId={id} reg={details} canManage={access.canManage} canScan={access.canScan} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {data.total > 0 && (
          <div className="border-t border-border p-4">
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath={base} searchParams={sp} />
          </div>
        )}
      </Card>
    </div>
  );
}
