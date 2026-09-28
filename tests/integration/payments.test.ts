import { beforeEach, describe, expect, it, vi } from "vitest";
import { signForTests } from "@/server/payments/signature";
import { AppError } from "@/server/errors";
import { asSession, makeCollege, makeEvent, makeUser, prisma, resetDb } from "../helpers";

// The Razorpay HTTP API is the only thing mocked: order creation and payment
// fetch return what Razorpay's sandbox would. Signatures are computed exactly
// as Razorpay computes them, and all verification logic runs for real.
const gatewayState = vi.hoisted(() => ({ orders: 0, payments: new Map<string, { status: string; amount: number; order_id: string }>(), refunds: 0 }));
vi.mock("@/server/payments/razorpay", () => ({
  gateway: {
    createOrder: vi.fn(async (input: { amount: number; currency: string }) => ({ id: `order_T${++gatewayState.orders}`, amount: input.amount, currency: input.currency, status: "created" })),
    fetchPayment: vi.fn(async (id: string) => {
      const p = gatewayState.payments.get(id);
      if (!p) throw new Error("not found");
      return { id, currency: "INR", method: "upi", ...p };
    }),
    capturePayment: vi.fn(async (id: string) => ({ ...gatewayState.payments.get(id)!, id, currency: "INR", status: "captured" })),
    refund: vi.fn(async (paymentId: string, amount: number) => ({ id: `rfnd_${++gatewayState.refunds}`, payment_id: paymentId, amount, status: "processed" })),
    publicKeyId: () => "rzp_test_dummykey",
  },
}));

const { registerForEvent } = await import("@/server/services/registrations");
const { createPaymentOrder, verifyCheckout, handleRazorpayWebhook, refundPayment } = await import("@/server/services/payments");

const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

async function paidSetup(capacity = 5) {
  const college = await makeCollege();
  const organizer = await makeUser("EVENT_ORGANIZER", college.id);
  const event = await makeEvent({ collegeId: college.id, organizerId: organizer.id, capacity, fee: 29900 });
  const student = await makeUser("STUDENT", college.id);
  const reg = await registerForEvent(asSession(student), { eventId: event.id });
  return { college, organizer, event, student, reg };
}

function webhookBody(event: string, payment: { id: string; order_id: string; amount: number; status: string }) {
  return JSON.stringify({ event, payload: { payment: { entity: { ...payment, currency: "INR", method: "upi" } } } });
}

describe("payments", () => {
  beforeEach(async () => {
    await resetDb();
    gatewayState.payments.clear();
  });

  it("creates a gateway order for a pending registration and reuses it on retry", async () => {
    const { student, reg } = await paidSetup();
    const o1 = await createPaymentOrder(asSession(student), reg.registrationId);
    expect(o1.orderId).toMatch(/^order_T/);
    expect(o1.amount).toBe(29900);
    expect(o1.keyId).toBe("rzp_test_dummykey");
    const o2 = await createPaymentOrder(asSession(student), reg.registrationId);
    expect(o2.orderId).toBe(o1.orderId);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("does not let another user pay for someone else's registration", async () => {
    const { college, reg } = await paidSetup();
    const other = await makeUser("STUDENT", college.id);
    await expect(createPaymentOrder(asSession(other), reg.registrationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("verifies the checkout signature and confirms the registration", async () => {
    const { student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    gatewayState.payments.set("pay_A", { status: "captured", amount: 29900, order_id: order.orderId });
    const res = await verifyCheckout(asSession(student), {
      razorpay_order_id: order.orderId,
      razorpay_payment_id: "pay_A",
      razorpay_signature: signForTests.checkout(order.orderId, "pay_A", KEY_SECRET),
    });
    expect(res.status).toBe("confirmed");
    const r = await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } });
    expect(r.status).toBe("CONFIRMED");
    const p = await prisma.payment.findFirstOrThrow();
    expect(p).toMatchObject({ status: "CAPTURED", razorpayPaymentId: "pay_A", mode: "TEST" });
  });

  it("rejects a forged checkout signature (browser success is never trusted)", async () => {
    const { student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    gatewayState.payments.set("pay_A", { status: "captured", amount: 29900, order_id: order.orderId });
    await expect(
      verifyCheckout(asSession(student), { razorpay_order_id: order.orderId, razorpay_payment_id: "pay_A", razorpay_signature: "a".repeat(64) }),
    ).rejects.toMatchObject({ code: "PAYMENT_ERROR" });
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } })).status).toBe("PENDING_PAYMENT");
  });

  it("rejects a valid signature when the gateway amount does not match", async () => {
    const { student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    gatewayState.payments.set("pay_B", { status: "captured", amount: 100, order_id: order.orderId });
    await expect(
      verifyCheckout(asSession(student), { razorpay_order_id: order.orderId, razorpay_payment_id: "pay_B", razorpay_signature: signForTests.checkout(order.orderId, "pay_B", KEY_SECRET) }),
    ).rejects.toMatchObject({ code: "PAYMENT_ERROR" });
  });

  it("processes a signed webhook and ignores exact replays (idempotency)", async () => {
    const { student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    const body = webhookBody("payment.captured", { id: "pay_W", order_id: order.orderId, amount: 29900, status: "captured" });
    const sig = signForTests.webhook(body, WEBHOOK_SECRET);
    const first = await handleRazorpayWebhook(body, sig, "evt_1");
    const second = await handleRazorpayWebhook(body, sig, "evt_1");
    expect(first).toMatchObject({ duplicate: false, handled: true });
    expect(second).toMatchObject({ duplicate: true });
    expect(await prisma.paymentWebhook.count()).toBe(1);
    expect(await prisma.registration.count({ where: { status: "CONFIRMED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: student.id, type: "PAYMENT_CONFIRMED" } })).toBe(1);
  });

  it("checkout verify + webhook for the same payment confirm exactly once", async () => {
    const { student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    gatewayState.payments.set("pay_C", { status: "captured", amount: 29900, order_id: order.orderId });
    const body = webhookBody("payment.captured", { id: "pay_C", order_id: order.orderId, amount: 29900, status: "captured" });
    const [a, b] = await Promise.all([
      verifyCheckout(asSession(student), { razorpay_order_id: order.orderId, razorpay_payment_id: "pay_C", razorpay_signature: signForTests.checkout(order.orderId, "pay_C", KEY_SECRET) }),
      handleRazorpayWebhook(body, signForTests.webhook(body, WEBHOOK_SECRET), "evt_2"),
    ]);
    expect(a.status === "confirmed" || a.status === "already_processed").toBe(true);
    expect(b.duplicate).toBe(false);
    expect(await prisma.notification.count({ where: { userId: student.id, type: "PAYMENT_CONFIRMED" } })).toBe(1);
    expect(await prisma.payment.count({ where: { status: "CAPTURED" } })).toBe(1);
  });

  it("rejects webhooks with an invalid signature", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    await expect(handleRazorpayWebhook(body, "deadbeef", "evt_x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.paymentWebhook.count()).toBe(0);
  });

  it("marks failed payments and keeps the registration pending for retry", async () => {
    const { student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    const body = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_F", order_id: order.orderId, amount: 29900, currency: "INR", status: "failed", error_description: "Card declined" } } } });
    await handleRazorpayWebhook(body, signForTests.webhook(body, WEBHOOK_SECRET), "evt_f");
    expect((await prisma.payment.findFirstOrThrow()).status).toBe("FAILED");
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } })).status).toBe("PENDING_PAYMENT");
  });

  it("a late payment for an expired hold on a now-full event is auto-refunded, not overbooked", async () => {
    const { college, student, event, reg } = await paidSetup(1);
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    // Hold expires, someone else takes the last seat
    await prisma.registration.update({ where: { id: reg.registrationId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const other = await makeUser("STUDENT", college.id);
    const r2 = await registerForEvent(asSession(other), { eventId: event.id });
    expect(r2.status).toBe("PENDING_PAYMENT");
    // Late webhook for the first student's payment
    const body = webhookBody("payment.captured", { id: "pay_L", order_id: order.orderId, amount: 29900, status: "captured" });
    await handleRazorpayWebhook(body, signForTests.webhook(body, WEBHOOK_SECRET), "evt_late");
    const p = await prisma.payment.findFirstOrThrow({ where: { razorpayOrderId: order.orderId } });
    expect(p.status).toBe("CAPTURED");
    expect(p.refundStatus).toBe("PENDING");
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } })).status).toBe("FAILED");
    expect(await prisma.registration.count({ where: { eventId: event.id, status: "CONFIRMED" } })).toBe(0);
  });

  it("refund.processed webhook completes a refund", async () => {
    const { organizer, student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    const cap = webhookBody("payment.captured", { id: "pay_R", order_id: order.orderId, amount: 29900, status: "captured" });
    await handleRazorpayWebhook(cap, signForTests.webhook(cap, WEBHOOK_SECRET), "evt_c");
    const payment = await prisma.payment.findFirstOrThrow();
    await refundPayment(asSession(organizer), payment.id, { reason: "Requested by student" });
    const rf = JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_R", amount: 29900, status: "processed" } } } });
    await handleRazorpayWebhook(rf, signForTests.webhook(rf, WEBHOOK_SECRET), "evt_r");
    const after = await prisma.payment.findFirstOrThrow();
    expect(after).toMatchObject({ status: "REFUNDED", refundStatus: "PROCESSED", refundAmount: 29900 });
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } })).status).toBe("CANCELLED");
  });

  it("only event managers can refund", async () => {
    const { college, student, reg } = await paidSetup();
    const order = await createPaymentOrder(asSession(student), reg.registrationId);
    const cap = webhookBody("payment.captured", { id: "pay_X", order_id: order.orderId, amount: 29900, status: "captured" });
    await handleRazorpayWebhook(cap, signForTests.webhook(cap, WEBHOOK_SECRET), "evt_x2");
    const payment = await prisma.payment.findFirstOrThrow();
    const otherOrganizer = await makeUser("EVENT_ORGANIZER", college.id);
    await expect(refundPayment(asSession(otherOrganizer), payment.id, { reason: "x" })).rejects.toBeInstanceOf(AppError);
    await expect(refundPayment(asSession(student), payment.id, { reason: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
