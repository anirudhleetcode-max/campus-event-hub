import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, Download } from "lucide-react";
import { pageUser, pageNum, sp, type SearchParams } from "@/server/page-guard";
import { listPayments } from "@/server/services/payments";
import { db } from "@/server/db";
import { collegeScope } from "@/server/auth/permissions";
import { PageHeader, EmptyState, StatCard, Alert } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/ui/status-badges";
import { PAYMENT_STATUS, REFUND_STATUS } from "@/lib/labels";
import { formatDateTime, formatRupees, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const [data, refundQueue] = await Promise.all([
    listPayments(user, { status: sp(params, "status"), refund: sp(params, "refund"), q: sp(params, "q"), page: pageNum(params) }),
    db.payment.count({ where: { refundStatus: "REQUESTED", event: collegeScope(user) } }),
  ]);
  const s = data.summary;
  return (
    <>
      <PageHeader
        title="Payments"
        description="Every transaction processed through Razorpay, with refunds and reconciliation references."
        actions={
          <a href="/api/exports/payments" className={buttonClasses("outline")}>
            <Download /> Export CSV
          </a>
        }
      />
      {refundQueue > 0 && (
        <Alert tone="warning" title={`${refundQueue} refund ${refundQueue === 1 ? "request needs" : "requests need"} attention`} className="mb-6"
          action={<Link href="/admin/payments?refund=REQUESTED" className={buttonClasses("outline", "sm")}>Review</Link>}>
          Participants cancelled paid registrations or events were cancelled. Process refunds from each event&apos;s Payments tab.
        </Alert>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Gross collected" value={formatRupees(s.gross)} hint={`${s.count} successful payments (filtered)`} />
        <StatCard label="Refunded" value={formatRupees(s.refunded)} />
        <StatCard label="Net revenue" value={formatRupees(s.gross - s.refunded)} />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search participant, registration ID, payment or order ID" className="lg:max-w-md lg:flex-1" label="Search payments" />
          <div className="flex flex-wrap gap-2">
            <UrlSelect param="status" label="Payment status" options={Object.entries(PAYMENT_STATUS).map(([v, o]) => ({ value: v, label: o.label }))} allLabel="Any status" />
            <UrlSelect param="refund" label="Refund status" options={Object.entries(REFUND_STATUS).filter(([v]) => v !== "NONE").map(([v, o]) => ({ value: v, label: o.label }))} allLabel="Any refund state" />
          </div>
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments found" description="Payments appear here as soon as participants check out." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Participant</TH>
                <TH>Event</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="hidden lg:table-cell">Transaction</TH>
                <TH className="hidden md:table-cell">Date</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <p className="font-medium">{p.registration.participantName}</p>
                    <p className="text-xs text-muted-foreground">{p.registration.code}</p>
                  </TD>
                  <TD>
                    <Link href={`/organizer/events/${p.event.id}/payments`} className="line-clamp-2 min-w-40 hover:text-primary">
                      {p.event.title}
                    </Link>
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    {formatMoney(p.amount, p.currency)}
                    {p.refundAmount > 0 && <p className="text-xs font-normal text-muted-foreground">−{formatMoney(p.refundAmount)}</p>}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <PaymentStatusBadge status={p.status} />
                      <RefundStatusBadge status={p.refundStatus} />
                      {p.mode !== "LIVE" && <Badge tone={p.mode === "DEMO" ? "neutral" : "info"}>{p.mode === "DEMO" ? "Demo" : "Test"}</Badge>}
                    </div>
                  </TD>
                  <TD className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                    <p>{p.razorpayPaymentId ?? "—"}</p>
                    <p>{p.razorpayOrderId ?? ""}</p>
                  </TD>
                  <TD className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{formatDateTime(p.paidAt ?? p.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="border-t border-border p-4">
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath="/admin/payments" searchParams={params} />
        </div>
      </Card>
    </>
  );
}
