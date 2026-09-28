"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { refundPaymentAction } from "@/app/actions/organizer";
import { refundSchema } from "@/lib/validators";
import { formatAmount } from "./format";

/** Full or partial refund of a captured payment. DEMO payments can't go through the gateway. */
export function RefundButton({
  eventId,
  payment,
}: {
  eventId: string;
  payment: { id: string; amount: number; currency: string; mode: "LIVE" | "TEST" | "DEMO"; participantName: string; requestedReason: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState(payment.requestedReason ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const id = React.useId();
  const max = payment.amount / 100;

  if (payment.mode === "DEMO") {
    return (
      <span title="Demo payments were never charged through the gateway, so they can't be refunded." className="inline-flex">
        <Button variant="outline" size="sm" disabled aria-describedby={`${id}-demo`}>
          <Undo2 /> Refund
        </Button>
        <span id={`${id}-demo`} className="sr-only">
          Demo payments can&apos;t be refunded
        </span>
      </span>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = refundSchema.safeParse({ paymentId: payment.id, amount: amount.trim() ? amount : undefined, reason });
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    else if (parsed.data.amount !== undefined && parsed.data.amount > max) errs.amount = `Can't exceed the amount paid (${formatAmount(payment.amount, payment.currency)})`;
    if (amount.trim() && !(Number(amount) > 0)) errs.amount = "Enter a positive amount in rupees";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setPending(true);
    setErrors({});
    try {
      const res = await refundPaymentAction(eventId, { paymentId: payment.id, amount: amount.trim() || undefined, reason });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? "Refund initiated.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Something went wrong while starting the refund. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Undo2 /> Refund
        </Button>
      </DialogTrigger>
      <DialogContent title={`Refund ${payment.participantName}`} description={`Paid ${formatAmount(payment.amount, payment.currency)}. A full refund also cancels the registration.`}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Amount (₹)" htmlFor={`${id}-amount`} error={errors.amount} hint={`Leave empty to refund the full ${formatAmount(payment.amount, payment.currency)}.`}>
            <Input type="number" inputMode="decimal" min={1} max={max} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(max)} />
          </Field>
          <Field label="Reason" htmlFor={`${id}-reason`} error={errors.reason} required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Go back
            </Button>
            <Button type="submit" variant="danger" loading={pending}>
              Issue refund
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
