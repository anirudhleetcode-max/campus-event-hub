/** Minimal typings for the Razorpay Checkout (checkout.js) browser API that we use. */

export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayFailureResponse = {
  error: {
    code?: string;
    description?: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
};

export type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
  retry?: { enabled: boolean; max_count?: number };
  handler: (response: RazorpaySuccessResponse) => void;
};

export type RazorpayInstance = {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", callback: (response: RazorpayFailureResponse) => void) => void;
};

export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

export const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function getConstructor(): RazorpayConstructor | undefined {
  return (window as Window & { Razorpay?: RazorpayConstructor }).Razorpay;
}

let loader: Promise<RazorpayConstructor> | null = null;

/** Loads checkout.js exactly once per page lifetime (retries after a network failure). */
export function loadRazorpay(): Promise<RazorpayConstructor> {
  const existing = getConstructor();
  if (existing) return Promise.resolve(existing);
  loader ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const fail = (script: HTMLScriptElement) => {
      script.remove();
      loader = null;
      reject(new Error("checkout_load_failed"));
    };
    let script = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    const el = script;
    el.addEventListener("load", () => {
      const ctor = getConstructor();
      if (ctor) resolve(ctor);
      else fail(el);
    });
    el.addEventListener("error", () => fail(el));
  });
  return loader;
}
