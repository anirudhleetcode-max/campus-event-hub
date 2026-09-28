import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, IndianRupee, Receipt, RotateCcw } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { listMyPayments } from "@/server/services/payments";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/ui/status-badges";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "My payments" };

/** formatMoney() renders 0 as "Free"; totals should read ₹0. */
const inr = (paise: number) => (paise === 0 ? "₹0" : formatMoney(paise));

export default async function MyPaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const payments = await listMyPayments(user);
  const paid = payments.filter((p) => p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED");
  const totalPaid = paid.reduce((s, p) => s + p.amount, 0);
  const totalRefunded = payments.reduce((s, p) => s + (p.refundStatus === "PROCESSED" ? p.refundAmount : 0), 0);

  return (
    <>
      <PageHeader title="Payments" description="Your event fee payments, refunds and receipts." />

      {payments.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Successful payments" value={formatNumber(paid.length)} icon={CreditCard} />
          <StatCard label="Total paid" value={inr(totalPaid)} icon={IndianRupee} />
          <StatCard label="Refunded" value={inr(totalRefunded)} icon={RotateCcw} />
        </div>
      )}

      <Card>
        {payments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No payments yet"
            description="When you register for a paid event, your payments and receipts will show up here."
            action={
              <Link href="/events?price=paid" className={buttonClasses("primary")}>
                Explore events
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Amount</TH>
                <TH>Status</TH>
                <TH>Refund</TH>
                <TH>Date</TH>
                <TH>
                  <span className="sr-only">Receipt</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="min-w-52">
                    <Link href={`/my/payments/${p.id}`} className="font-medium hover:text-primary">
                      {p.event.title}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="font-mono">{p.receipt}</span>
                      {p.mode === "DEMO" && <Badge tone="warning">Demo</Badge>}
                      {p.mode === "TEST" && <Badge tone="info">Test</Badge>}
                    </p>
                  </TD>
                  <TD className="font-medium whitespace-nowrap tabular-nums">{formatMoney(p.amount, p.currency)}</TD>
                  <TD>
                    <PaymentStatusBadge status={p.status} />
                  </TD>
                  <TD>
                    {p.refundStatus === "NONE" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-col items-start gap-0.5">
                        <RefundStatusBadge status={p.refundStatus} />
                        {p.refundAmount > 0 && <span className="text-xs text-muted-foreground tabular-nums">{formatMoney(p.refundAmount, p.currency)}</span>}
                      </span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(p.paidAt ?? p.createdAt)}</TD>
                  <TD className="text-right">
                    <Link href={`/my/payments/${p.id}`} className={buttonClasses("ghost", "sm")}>
                      <Receipt aria-hidden />
                      {p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED" ? "Receipt" : "Details"}
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
