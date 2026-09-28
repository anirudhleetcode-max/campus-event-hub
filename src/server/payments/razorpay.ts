import "server-only";
import Razorpay from "razorpay";
import { env, razorpayConfigured } from "../env";
import { AppError } from "../errors";

let client: Razorpay | null = null;

function rzp(): Razorpay {
  if (!razorpayConfigured()) {
    throw new AppError(
      "PAYMENTS_NOT_CONFIGURED",
      "Online payments are not configured yet. Please contact the event organizer.",
    );
  }
  client ??= new Razorpay({ key_id: env().RAZORPAY_KEY_ID!, key_secret: env().RAZORPAY_KEY_SECRET! });
  return client;
}

export type GatewayOrder = { id: string; amount: number; currency: string; status: string };
export type GatewayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  amount_refunded?: number;
};
export type GatewayRefund = { id: string; payment_id: string; amount: number; status: string };

/** Wraps SDK errors so gateway internals never leak to users. */
async function call<T>(fn: () => Promise<unknown>): Promise<T> {
  try {
    return (await fn()) as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const e = err as { statusCode?: number; error?: { description?: string } };
    throw new AppError("PAYMENT_ERROR", "The payment gateway could not process this request. Please try again.", {
      details: { gatewayStatus: e.statusCode, gatewayMessage: e.error?.description },
    });
  }
}

export const gateway = {
  createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) {
    return call<GatewayOrder>(() => rzp().orders.create({ ...input, payment_capture: true } as never));
  },
  fetchPayment(paymentId: string) {
    return call<GatewayPayment>(() => rzp().payments.fetch(paymentId));
  },
  capturePayment(paymentId: string, amount: number, currency: string) {
    return call<GatewayPayment>(() => rzp().payments.capture(paymentId, amount, currency));
  },
  refund(paymentId: string, amount: number, notes: Record<string, string>) {
    return call<GatewayRefund>(() => rzp().payments.refund(paymentId, { amount, notes, speed: "normal" }));
  },
  publicKeyId(): string {
    rzp();
    return env().RAZORPAY_KEY_ID!;
  },
};
