import { createHmac, timingSafeEqual } from "node:crypto";

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function equalHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Razorpay Checkout signature:
 *   HMAC_SHA256(order_id + "|" + razorpay_payment_id, key_secret)
 * https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/#verify-payment-signature
 */
export function verifyCheckoutSignature(p: { orderId: string; paymentId: string; signature: string; secret: string }): boolean {
  if (!p.orderId || !p.paymentId || !p.signature || !p.secret) return false;
  return equalHex(p.signature, hmacHex(p.secret, `${p.orderId}|${p.paymentId}`));
}

/**
 * Razorpay webhook signature: HMAC_SHA256(raw request body, webhook_secret),
 * sent in the X-Razorpay-Signature header. Must use the *raw* body bytes.
 */
export function verifyWebhookSignature(p: { rawBody: string; signature: string | null; secret: string }): boolean {
  if (!p.signature || !p.secret) return false;
  return equalHex(p.signature, hmacHex(p.secret, p.rawBody));
}

/** Test helpers mirror exactly what Razorpay computes on its side. */
export const signForTests = {
  checkout: (orderId: string, paymentId: string, secret: string) => hmacHex(secret, `${orderId}|${paymentId}`),
  webhook: (rawBody: string, secret: string) => hmacHex(secret, rawBody),
};
