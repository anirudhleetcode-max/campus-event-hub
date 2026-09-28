import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Download, IndianRupee, ReceiptText, Undo2 } from "lucide-react";
import { db } from "@/server/db";
import { listPayments } from "@/server/services/payments";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, StatCard } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { RefundButton } from "@/components/organizer/refund-button";
import { formatAmount } from "@/components/organizer/format";
import { PAYMENT_STATUS, REFUND_STATUS } from "@/lib/labels";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import { guarded, loadStaffEvent, pageParam, param } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Payments" };

const STATUS_OPTIONS = Object.entries(PAYMENT_STATUS).map(([value, s]) => ({ value, label: s.label }));
const REFUND_OPTIONS = Object.entries(REFUND_STATUS)
  .filter(([v]) => v !== "NONE")
  .map(([value, s]) => ({ value, label: s.label }));

export default async function EventPaymentsPage({ params, searchParams }: PageProps<"/organizer/events/[id]/payments">) {
  const { id } = await params;
  const sp = await searchParams;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  const { access, event } = ev.data;
  if (!access.canView) return <ForbiddenState message="Volunteers can only use the check-in scanner for this event." backHref={`/organizer/events/${id}/scan`} backLabel="Open scanner" />;

  const status = param(sp.status);
  const refund = param(sp.refund);
  const res = await guarded(() =>
    listPayments(user, {
      eventId: id,
      q: param(sp.q),
      status: status && status in PAYMENT_STATUS ? status : undefined,
      refund: refund && refund in REFUND_STATUS ? refund : undefined,
      page: pageParam(sp.page),
    }),
  );
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const data = res.data;
  const queue = await db.payment.count({ where: { eventId: id, refundStatus: "REQUESTED" } });
  const filtered = Boolean(sp.q || sp.status || sp.refund);
  const base = `/organizer/events/${id}/payments`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Payments</h2>
          <p className="text-sm text-muted-foreground">{event.feeAmount ? `${formatAmount(event.feeAmount, event.currency)} per registration` : "This is a free event."}</p>
        </div>
        <a href={`/api/exports/payments?eventId=${id}`} className={buttonClasses("outline", "sm")} download>
          <Download /> Export CSV
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gross collected" value={formatAmount(data.summary.gross)} icon={IndianRupee} hint={`${formatNumber(data.summary.count)} successful payments`} />
        <StatCard label="Refunded" value={formatAmount(data.summary.refunded)} icon={Undo2} />
        <StatCard label="Net revenue" value={formatAmount(data.summary.gross - data.summary.refunded)} icon={ReceiptText} />
        <StatCard label="Refund requests" value={formatNumber(queue)} icon={CreditCard} hint={queue ? "Waiting for review" : "Nothing pending"} />
      </div>

      {queue > 0 && refund !== "REQUESTED" && (
        <Alert
          tone="warning"
          title={`${queue} refund request${queue === 1 ? "" : "s"} waiting`}
          action={
            <Link href={`${base}?refund=REQUESTED`} className="shrink-0 self-center text-sm font-semibold underline-offset-4 hover:underline">
              Review
            </Link>
          }
        >
          Participants who cancelled (or whose registration was cancelled) are waiting for their money back.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search name, REG-ID or payment ID…" label="Search payments" className="lg:max-w-sm lg:flex-1" />
          <div className="flex flex-wrap gap-3">
            <UrlSelect param="status" label="Payment status" options={STATUS_OPTIONS} allLabel="All payments" />
            <UrlSelect param="refund" label="Refund status" options={REFUND_OPTIONS} allLabel="Any refund status" />
          </div>
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={CreditCard} title={filtered ? "No payments match your filters" : "No payments yet"} description={filtered ? "Try a different search or filter." : "Payments appear here once participants pay for their registration."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Participant</TH>
                <TH>Registration</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH>Refund</TH>
                <TH>Paid at</TH>
                <TH>Reference</TH>
                {access.canManage && (
                  <TH className="w-28">
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </tr>
            </THead>
            <TBody>
              {data.items.map((p) => (
                <TR key={p.id} className={cn(p.refundStatus === "REQUESTED" && "bg-warning-soft/40 hover:bg-warning-soft/60")}>
                  <TD className="min-w-[12rem]">
                    <p className="font-medium">{p.registration.participantName}</p>
                    <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{p.registration.participantEmail}</p>
                  </TD>
                  <TD className="font-mono text-xs whitespace-nowrap">{p.registration.code}</TD>
                  <TD className="text-right whitespace-nowrap tabular-nums">
                    {formatAmount(p.amount, p.currency)}
                    {p.refundAmount > 0 && <p className="text-xs text-muted-foreground">−{formatAmount(p.refundAmount, p.currency)}</p>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <PaymentStatusBadge status={p.status} />
                      {p.mode !== "LIVE" && <Badge>{p.mode === "DEMO" ? "Demo" : "Test"}</Badge>}
                    </div>
                  </TD>
                  <TD>
                    {p.refundStatus === "NONE" ? <span className="text-xs text-muted-foreground">—</span> : <RefundStatusBadge status={p.refundStatus} />}
                    {p.refundReason && <p className="mt-1 max-w-[14rem] truncate text-xs text-muted-foreground" title={p.refundReason}>{p.refundReason}</p>}
                  </TD>
                  <TD className="whitespace-nowrap">{p.paidAt ? formatDateTime(p.paidAt) : "—"}</TD>
                  <TD className="font-mono text-xs whitespace-nowrap text-muted-foreground">{p.razorpayPaymentId ?? p.receipt}</TD>
                  {access.canManage && (
                    <TD className="text-right">
                      {p.status === "CAPTURED" && (p.refundStatus === "NONE" || p.refundStatus === "REQUESTED" || p.refundStatus === "FAILED") && (
                        <RefundButton
                          eventId={id}
                          payment={{ id: p.id, amount: p.amount, currency: p.currency, mode: p.mode, participantName: p.registration.participantName, requestedReason: p.refundReason }}
                        />
                      )}
                    </TD>
                  )}
                </TR>
              ))}
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
