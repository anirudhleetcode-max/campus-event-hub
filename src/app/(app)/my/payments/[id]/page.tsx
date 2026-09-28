import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Ticket } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getMyPayment } from "@/server/services/payments";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, DescriptionList, PageHeader } from "@/components/ui/misc";
import { PaymentStatusBadge, RefundStatusBadge } from "@/components/ui/status-badges";
import { Logo } from "@/components/layout/logo";
import { PrintArea } from "@/components/student/print-area";
import { PrintButton } from "@/components/student/print-button";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Payment receipt" };

const METHOD_LABEL: Record<string, string> = { card: "Card", upi: "UPI", netbanking: "Net banking", wallet: "Wallet", emi: "EMI", demo: "Demo checkout" };

export default async function PaymentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!z.uuid().safeParse(id).success) notFound();
  let p: Awaited<ReturnType<typeof getMyPayment>>;
  try {
    p = await getMyPayment(user, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const isPaid = p.status === "CAPTURED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isPaid ? "Payment receipt" : "Payment details"}
        breadcrumbs={[{ label: "Payments", href: "/my/payments" }, { label: p.receipt }]}
        actions={
          <>
            <Link href={`/my/registrations/${p.registration.id}`} className={buttonClasses("ghost")}>
              <Ticket aria-hidden />
              Registration
            </Link>
            {isPaid && <PrintButton label="Print receipt" />}
          </>
        }
      />

      <div className="mb-4 space-y-3">
        {p.mode === "DEMO" && (
          <Alert tone="warning" title="Demo payment">
            This payment was simulated in demo mode. No money was charged and this receipt is not valid for accounting.
          </Alert>
        )}
        {p.mode === "TEST" && (
          <Alert tone="info" title="Test mode">
            This payment was processed with the payment gateway in test mode. No real money was charged.
          </Alert>
        )}
        {p.status === "FAILED" && (
          <Alert tone="danger" title="Payment failed">
            {p.failureReason ?? "The payment did not go through."} Any amount debited is automatically reversed by your bank.
          </Alert>
        )}
      </div>

      <PrintArea>
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="space-y-1">
              <Logo />
              <p className="text-xs text-muted-foreground">Issued on behalf of {p.event.college.name}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{isPaid ? "Receipt" : "Payment"}</p>
              <p className="font-mono text-sm font-semibold">{p.receipt}</p>
              <div className="mt-1 flex flex-wrap gap-1.5 sm:justify-end">
                <PaymentStatusBadge status={p.status} />
                <RefundStatusBadge status={p.refundStatus} />
                {p.mode === "DEMO" && <Badge tone="warning">Demo</Badge>}
                {p.mode === "TEST" && <Badge tone="info">Test mode</Badge>}
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Billed to</p>
              <p className="mt-1 font-semibold break-words">{p.registration.participantName}</p>
              <p className="text-sm break-all text-muted-foreground">{p.registration.participantEmail}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Event</p>
              <p className="mt-1 font-semibold break-words">{p.event.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(p.event.startsAt)} · Reg. <span className="font-mono">{p.registration.code}</span>
              </p>
            </div>
          </div>

          <div className="border-t border-border px-5 py-2 sm:px-6">
            <DescriptionList
              items={[
                { label: "Amount", value: <span className="text-base tabular-nums">{formatMoney(p.amount, p.currency)}</span> },
                { label: "Status", value: <PaymentStatusBadge status={p.status} /> },
                { label: "Paid at", value: p.paidAt ? formatDateTime(p.paidAt) : "—" },
                { label: "Payment method", value: p.method ? (METHOD_LABEL[p.method] ?? p.method) : "—" },
                { label: "Transaction ID", value: <span className="font-mono text-xs break-all">{p.razorpayPaymentId ?? "—"}</span> },
                { label: "Order ID", value: <span className="font-mono text-xs break-all">{p.razorpayOrderId ?? "—"}</span> },
                { label: "Initiated", value: formatDateTime(p.createdAt) },
                ...(p.refundStatus !== "NONE"
                  ? [
                      { label: "Refund status", value: <RefundStatusBadge status={p.refundStatus} /> },
                      ...(p.refundAmount > 0 ? [{ label: "Refund amount", value: <span className="tabular-nums">{formatMoney(p.refundAmount, p.currency)}</span> }] : []),
                      ...(p.refundedAt ? [{ label: "Refunded at", value: formatDateTime(p.refundedAt) }] : []),
                      ...(p.razorpayRefundId ? [{ label: "Refund ID", value: <span className="font-mono text-xs break-all">{p.razorpayRefundId}</span> }] : []),
                      ...(p.refundReason ? [{ label: "Refund reason", value: p.refundReason }] : []),
                    ]
                  : []),
              ]}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border bg-surface-2/60 px-5 py-4 sm:px-6">
            <p className="text-sm font-medium">Total {isPaid ? "paid" : "due"}</p>
            <p className="text-xl font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</p>
          </div>
          <p className="px-5 py-3 text-xs text-muted-foreground sm:px-6">
            This is a computer-generated receipt and does not require a signature.
            {p.mode === "DEMO" ? " Demo transaction — no money was charged." : ""}
          </p>
        </Card>
      </PrintArea>

      <div className="mt-6 print:hidden">
        <Link href="/my/payments" className={buttonClasses("ghost", "sm")}>
          <ArrowLeft aria-hidden />
          All payments
        </Link>
      </div>
    </div>
  );
}
