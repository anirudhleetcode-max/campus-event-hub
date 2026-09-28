"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { formatTime } from "@/lib/utils";
import { loadRazorpay, type RazorpayConstructor, type RazorpayFailureResponse, type RazorpaySuccessResponse } from "./razorpay-types";

/** Razorpay's checkout theme only accepts hex colours; this matches the brand primary. */
const CHECKOUT_THEME_COLOR = "#4F46E5";

type OrderResponse = {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  holdExpiresAt: string | null;
  eventTitle: string;
  prefill: { name?: string; email?: string; contact?: string };
};

type VerifyResponse = { status: "confirmed" | "already_processed" | "refund_required"; registrationId: string };
type ApiError = { error?: string; code?: string };

export type CheckoutPhase = "idle" | "creating" | "checkout" | "verifying" | "verify_failed" | "done";

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; code?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as T & ApiError;
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error ?? "Something went wrong. Please try again.", code: data.code };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: "We couldn't reach the server. Check your connection and try again.", code: "NETWORK" };
  }
}

/**
 * Order → Razorpay Checkout → server verification, as a reusable hook.
 * The server (verify endpoint + webhook) is the only thing that confirms a
 * registration; the browser callback just asks it to check.
 */
export function useRazorpayCheckout() {
  const router = useRouter();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const busy = useRef(false);

  // Warm up checkout.js so the payment window opens instantly (failure is handled on click).
  useEffect(() => {
    loadRazorpay().catch(() => undefined);
  }, []);

  const verify = useCallback(
    async (regId: string, response: RazorpaySuccessResponse) => {
      setPhase("verifying");
      const res = await postJson<VerifyResponse>("/api/payments/verify", {
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      });
      busy.current = false;
      if (!res.ok) {
        setVerifyError(res.error);
        setPhase("verify_failed");
        toast.error("We couldn't confirm your payment yet.");
        return;
      }
      setPhase("done");
      if (res.data.status === "refund_required") {
        toast.warning("Payment received, but the seat is no longer available. A full refund has been initiated.");
        router.push(`/my/registrations/${regId}`);
      } else {
        toast.success("Payment successful! Your registration is confirmed.");
        router.push(`/my/registrations/${regId}?paid=1`);
      }
      router.refresh();
    },
    [router],
  );

  const pay = useCallback(
    async (regId: string) => {
      if (busy.current) return;
      busy.current = true;
      setRegistrationId(regId);
      setError(null);
      setVerifyError(null);
      setPhase("creating");

      const order = await postJson<OrderResponse>("/api/payments/order", { registrationId: regId });
      if (!order.ok) {
        busy.current = false;
        setPhase("idle");
        if (order.code === "PAYMENTS_NOT_CONFIGURED" || order.status === 503) {
          setNotConfigured(true);
          return;
        }
        if (order.code === "ALREADY_REGISTERED") {
          toast.success("This registration is already paid and confirmed.");
          router.push(`/my/registrations/${regId}`);
          return;
        }
        setError(order.error);
        toast.error(order.error);
        return;
      }
      const o = order.data;
      setHoldExpiresAt(o.holdExpiresAt);

      let Razorpay: RazorpayConstructor;
      try {
        Razorpay = await loadRazorpay();
      } catch {
        busy.current = false;
        setPhase("idle");
        const msg = "We couldn't load the secure payment window. Check your connection or disable content blockers, then try again.";
        setError(msg);
        toast.error(msg);
        return;
      }

      let settled = false;
      const rzp = new Razorpay({
        key: o.keyId,
        amount: o.amount,
        currency: o.currency,
        order_id: o.orderId,
        name: "Campus Event Hub",
        description: o.eventTitle,
        prefill: o.prefill,
        notes: { registrationId: regId },
        theme: { color: CHECKOUT_THEME_COLOR },
        modal: {
          confirm_close: true,
          ondismiss: () => {
            if (settled) return;
            busy.current = false;
            setPhase("idle");
            void postJson("/api/payments/dismiss", { orderId: o.orderId });
            toast.info(
              o.holdExpiresAt
                ? `Payment cancelled. Your seat is held until ${formatTime(o.holdExpiresAt)} — you can complete payment any time before then.`
                : "Payment cancelled. You can try again whenever you're ready.",
            );
          },
        },
        handler: (response) => {
          settled = true;
          void verify(regId, response);
        },
      });
      rzp.on("payment.failed", (resp: RazorpayFailureResponse) => {
        const msg = resp.error.description
          ? `Payment failed: ${resp.error.description}`
          : "Your payment could not be completed. No money was taken — please try again or use a different method.";
        setError(msg);
        toast.error(msg);
      });
      setPhase("checkout");
      rzp.open();
    },
    [router, verify],
  );

  return { pay, phase, error, verifyError, notConfigured, holdExpiresAt, registrationId, busy: phase === "creating" || phase === "checkout" || phase === "verifying" };
}

export type CheckoutState = ReturnType<typeof useRazorpayCheckout>;

/** Renders the blocking "confirming" overlay and any checkout errors for a checkout state. */
export function CheckoutFeedback({ state }: { state: CheckoutState }) {
  return (
    <>
      {state.phase === "verifying" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="verifying-title" aria-describedby="verifying-desc">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center shadow-lg">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden />
            <h2 id="verifying-title" className="mt-4 text-base font-semibold">
              Confirming your payment…
            </h2>
            <p id="verifying-desc" className="mt-1 text-sm text-muted-foreground">
              This usually takes a few seconds. Please don&apos;t close or refresh this page.
            </p>
          </div>
        </div>
      )}
      {state.notConfigured && (
        <Alert tone="warning" title="Online payments are not available right now">
          This event requires a fee, but online payments haven&apos;t been configured on this platform yet. Your seat hold will expire automatically — please contact the event organizer.
        </Alert>
      )}
      {state.error && state.phase !== "verify_failed" && <Alert tone="danger">{state.error}</Alert>}
      {state.phase === "verify_failed" && (
        <Alert tone="danger" title="We couldn't confirm your payment yet">
          <p>{state.verifyError}</p>
          <p className="mt-1">
            If money was deducted from your account, don&apos;t worry — it will be reconciled automatically with the payment gateway and your registration will be confirmed (or refunded) without any action from you.
          </p>
          {state.registrationId && (
            <Link href={`/my/registrations/${state.registrationId}`} className="mt-2 inline-block font-semibold underline underline-offset-2">
              View registration status
            </Link>
          )}
        </Alert>
      )}
    </>
  );
}

/** Self-contained "Complete payment" button (order → checkout → verify) for a pending registration. */
export function PayButton({
  registrationId,
  label = "Complete payment",
  size = "md",
  className,
}: {
  registrationId: string;
  label?: string;
  size?: ButtonProps["size"];
  className?: string;
}) {
  const state = useRazorpayCheckout();
  return (
    <div className="space-y-3">
      <CheckoutFeedback state={state} />
      <Button
        type="button"
        size={size}
        className={className}
        loading={state.busy}
        disabled={state.notConfigured || state.phase === "done"}
        onClick={() => void state.pay(registrationId)}
      >
        {!state.busy && <CreditCard aria-hidden />}
        {state.phase === "creating" ? "Preparing payment…" : state.phase === "checkout" ? "Waiting for payment…" : label}
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden />
        Payments are processed securely by Razorpay.
      </p>
    </div>
  );
}
