import "server-only";
import type { Payment, Prisma } from "@prisma/client";
import { db } from "../db";
import { env, razorpayMode } from "../env";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import { notify } from "../notifications";
import { publish, publishEventStats } from "../realtime";
import { gateway, type GatewayPayment } from "../payments/razorpay";
import { verifyCheckoutSignature, verifyWebhookSignature } from "../payments/signature";
import { collegeScope, requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { isRegistrationOpen } from "@/lib/event-status";
import { formatMoney } from "@/lib/utils";
import { lockEvent, seatsTaken } from "./events";
import { onRegistrationConfirmed } from "./registrations";
import { getSettings } from "./settings";
import { randomToken } from "../crypto";

/**
 * PAYMENT ARCHITECTURE
 *
 *   1. createOrder      – server creates a Razorpay order for a PENDING_PAYMENT
 *                         registration whose seat hold is active.
 *   2. Checkout         – browser opens Razorpay Checkout with the order id.
 *   3. verifyCheckout   – browser posts {order_id, payment_id, signature}; the
 *                         server verifies the HMAC signature AND fetches the
 *                         payment from Razorpay to confirm status and amount.
 *   4. Webhook          – Razorpay independently notifies payment.captured /
 *                         payment.failed / refund.*; signature-verified and
 *                         de-duplicated by x-razorpay-event-id.
 *   5. markCaptured     – idempotent: whichever of (3) or (4) arrives first
 *                         confirms the registration; the other is a no-op.
 *
 * The browser's "success" callback alone never confirms anything.
 */

type Json = Prisma.InputJsonValue;

function safeGatewayMeta(p: Partial<GatewayPayment>): Json {
  return {
    status: p.status ?? null,
    method: p.method ?? null,
    bank: p.bank ?? null,
    wallet: p.wallet ?? null,
    errorCode: p.error_code ?? null,
    errorDescription: p.error_description ?? null,
  };
}

// ─── 1. Order creation ─────────────────────────────────────

export async function createPaymentOrder(actor: SessionUser, registrationId: string) {
  const now = new Date();
  const settings = await getSettings();

  // Validate and (if needed) refresh the seat hold under the event lock.
  const reg = await db.$transaction(async (tx) => {
    const r = await tx.registration.findFirst({
      where: { id: registrationId, userId: actor.id },
      include: { event: true },
    });
    if (!r) throw notFound("Registration");
    if (r.status === "CONFIRMED") throw new AppError("ALREADY_REGISTERED", "This registration is already paid and confirmed.");
    if (r.status !== "PENDING_PAYMENT" && r.status !== "EXPIRED") throw new AppError("CONFLICT", "This registration is no longer awaiting payment.");
    if (r.amount <= 0) throw new AppError("CONFLICT", "This registration does not require payment.");
    if (!isRegistrationOpen(r.event, now)) throw new AppError("REGISTRATION_CLOSED", "Registration for this event is closed.");

    if (r.status === "EXPIRED" || !r.holdExpiresAt || r.holdExpiresAt <= now) {
      await lockEvent(tx, r.eventId);
      const taken = await seatsTaken(r.eventId, tx, r.id);
      if (taken >= r.event.capacity) {
        throw new AppError("EVENT_FULL", "Your seat reservation expired and the event is now full.");
      }
      return tx.registration.update({
        where: { id: r.id },
        data: { status: "PENDING_PAYMENT", holdExpiresAt: new Date(now.getTime() + settings.seatHoldMinutes * 60_000) },
        include: { event: true },
      });
    }
    return r;
  });

  // Reuse a recent unpaid order for the same amount (avoids orphan orders on retries).
  const recent = await db.payment.findFirst({
    where: {
      registrationId: reg.id,
      status: "CREATED",
      amount: reg.amount,
      razorpayOrderId: { not: null },
      createdAt: { gt: new Date(now.getTime() - 30 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });

  let payment: Payment;
  if (recent) {
    payment = recent;
  } else {
    const receipt = `rcpt_${randomToken(12)}`;
    const order = await gateway.createOrder({
      amount: reg.amount,
      currency: reg.event.currency,
      receipt,
      notes: { registrationId: reg.id, eventId: reg.eventId, userId: actor.id },
    });
    payment = await db.payment.create({
      data: {
        registrationId: reg.id,
        userId: actor.id,
        eventId: reg.eventId,
        amount: reg.amount,
        currency: reg.event.currency,
        receipt,
        razorpayOrderId: order.id,
        mode: razorpayMode(),
        status: "CREATED",
      },
    });
    logger.info("Payment order created", { paymentId: payment.id, orderId: order.id, amount: reg.amount });
  }

  await publishEventStats(reg.eventId);
  return {
    paymentId: payment.id,
    orderId: payment.razorpayOrderId!,
    amount: payment.amount,
    currency: payment.currency,
    keyId: gateway.publicKeyId(),
    holdExpiresAt: reg.holdExpiresAt,
    eventTitle: reg.event.title,
    prefill: { name: reg.participantName, email: reg.participantEmail, contact: reg.participantPhone ?? undefined },
  };
}

// ─── 3. Checkout callback verification ─────────────────────

export async function verifyCheckout(
  actor: SessionUser,
  input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
) {
  const payment = await db.payment.findUnique({ where: { razorpayOrderId: input.razorpay_order_id } });
  if (!payment || payment.userId !== actor.id) throw notFound("Payment");

  const valid = verifyCheckoutSignature({
    orderId: input.razorpay_order_id,
    paymentId: input.razorpay_payment_id,
    signature: input.razorpay_signature,
    secret: env().RAZORPAY_KEY_SECRET ?? "",
  });
  if (!valid) {
    logger.warn("Invalid checkout signature", { paymentId: payment.id });
    await audit({ actorId: actor.id, action: "payment.signature_invalid", entityType: "payment", entityId: payment.id });
    throw new AppError("PAYMENT_ERROR", "We couldn't verify this payment. If money was deducted, it will be reconciled automatically.");
  }

  // Signature proves authenticity; the gateway fetch proves the current state and amount.
  let gp = await gateway.fetchPayment(input.razorpay_payment_id);
  if (gp.order_id !== input.razorpay_order_id || gp.amount !== payment.amount || gp.currency !== payment.currency) {
    logger.error("Gateway payment mismatch", { paymentId: payment.id, gatewayOrder: gp.order_id, gatewayAmount: gp.amount });
    throw new AppError("PAYMENT_ERROR", "The payment details did not match this order. Please contact support.");
  }
  if (gp.status === "authorized") gp = await gateway.capturePayment(gp.id, gp.amount, gp.currency);
  if (gp.status !== "captured") {
    throw new AppError("PAYMENT_ERROR", "The payment has not completed yet. We'll confirm your registration as soon as it does.");
  }
  return markPaymentCaptured(payment.id, gp, "checkout");
}

// ─── 5. Idempotent capture ─────────────────────────────────

type CaptureOutcome = { status: "confirmed" | "already_processed" | "refund_required"; registrationId: string };

/**
 * Marks a payment captured and confirms its registration. Safe to call any
 * number of times (checkout callback, webhook, retries): the payment row is
 * locked and a second call observes status=CAPTURED and returns early.
 *
 * If the seat hold expired AND the event filled up meanwhile, the payment is
 * kept but flagged for automatic refund — no overbooking, no lost money.
 */
export async function markPaymentCaptured(paymentId: string, gp: Partial<GatewayPayment> & { id: string }, source: "checkout" | "webhook"): Promise<CaptureOutcome> {
  const now = new Date();
  const outcome = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { registration: { include: { event: true } } } });
      if (payment.status === "CAPTURED" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") {
        return { status: "already_processed" as const, registrationId: payment.registrationId, payment };
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "CAPTURED",
          razorpayPaymentId: gp.id,
          method: gp.method ?? payment.method,
          paidAt: now,
          failureReason: null,
          gatewayMeta: safeGatewayMeta(gp),
        },
      });

      const reg = payment.registration;
      await lockEvent(tx, reg.eventId);
      if (reg.status === "CONFIRMED") {
        // Duplicate payment for an already-confirmed registration → refund this one.
        await tx.payment.update({ where: { id: payment.id }, data: { refundStatus: "REQUESTED", refundReason: "Duplicate payment" } });
        return { status: "refund_required" as const, registrationId: reg.id, payment };
      }

      const holdActive = reg.status === "PENDING_PAYMENT" && reg.holdExpiresAt && reg.holdExpiresAt > now;
      const seatAvailable = holdActive || (await seatsTaken(reg.eventId, tx, reg.id)) < reg.event.capacity;
      const eventActive = !["CANCELLED", "ARCHIVED"].includes(reg.event.status);
      const regRecoverable = reg.status === "PENDING_PAYMENT" || reg.status === "EXPIRED";

      if (seatAvailable && eventActive && regRecoverable) {
        await tx.registration.update({
          where: { id: reg.id },
          data: { status: "CONFIRMED", confirmedAt: now, holdExpiresAt: null },
        });
        return { status: "confirmed" as const, registrationId: reg.id, payment };
      }

      await tx.registration.update({ where: { id: reg.id }, data: { status: reg.status === "CANCELLED" ? "CANCELLED" : "FAILED", holdExpiresAt: null } });
      await tx.payment.update({
        where: { id: payment.id },
        data: { refundStatus: "REQUESTED", refundReason: eventActive ? "Seat no longer available" : "Event cancelled" },
      });
      return { status: "refund_required" as const, registrationId: reg.id, payment };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  if (outcome.status === "already_processed") return { status: outcome.status, registrationId: outcome.registrationId };

  const { payment } = outcome;
  logger.info("Payment captured", { paymentId, source, outcome: outcome.status });
  await audit({ actorId: null, action: "payment.captured", entityType: "payment", entityId: paymentId, metadata: { source, outcome: outcome.status, amount: payment.amount } });
  await publish(`user:${payment.userId}`, { kind: "payment", paymentId, status: "CAPTURED", outcome: outcome.status });
  await publishEventStats(payment.eventId);

  if (outcome.status === "confirmed") {
    await notify([payment.userId], {
      type: "PAYMENT_CONFIRMED",
      title: "Payment received",
      body: `We received ${formatMoney(payment.amount, payment.currency)} for ${payment.registration.event.title}. Receipt: ${payment.receipt}.`,
      link: `/my/payments/${payment.id}`,
      email: true,
      emailCta: "View receipt",
    });
    await onRegistrationConfirmed(outcome.registrationId);
  } else {
    await notify([payment.userId], {
      type: "REFUND_UPDATE",
      title: "Payment will be refunded",
      body: `Your payment for ${payment.registration.event.title} was received, but the seat is no longer available. A full refund has been initiated.`,
      link: `/my/payments/${payment.id}`,
      email: true,
    });
    await autoRefund(paymentId).catch((err) => logger.error("Automatic refund failed", { paymentId, error: err }));
  }
  return { status: outcome.status, registrationId: outcome.registrationId };
}

export async function markPaymentFailed(orderId: string, gp: Partial<GatewayPayment> & { id: string }) {
  const payment = await db.payment.findUnique({ where: { razorpayOrderId: orderId } });
  if (!payment || payment.status !== "CREATED") return;
  const reason = gp.error_description ?? "Payment failed";
  const res = await db.payment.updateMany({
    where: { id: payment.id, status: "CREATED" },
    data: { status: "FAILED", razorpayPaymentId: gp.id, failureReason: reason.slice(0, 300), gatewayMeta: safeGatewayMeta(gp) },
  });
  if (res.count === 0) return;
  await audit({ actorId: null, action: "payment.failed", entityType: "payment", entityId: payment.id, metadata: { reason } });
  await publish(`user:${payment.userId}`, { kind: "payment", paymentId: payment.id, status: "FAILED" });
  await notify([payment.userId], {
    type: "PAYMENT_FAILED",
    title: "Payment failed",
    body: `Your payment could not be completed (${reason}). Your seat is held for a few more minutes — you can retry from your registration.`,
    link: `/my/registrations/${payment.registrationId}`,
  });
}

/** Records a checkout the user dismissed. The seat hold simply expires. */
export async function recordCheckoutDismissed(actor: SessionUser, orderId: string) {
  const payment = await db.payment.findUnique({ where: { razorpayOrderId: orderId } });
  if (!payment || payment.userId !== actor.id) return;
  await audit({ actorId: actor.id, action: "payment.checkout_dismissed", entityType: "payment", entityId: payment.id });
}

// ─── 4. Webhooks ───────────────────────────────────────────

type WebhookBody = {
  event: string;
  payload: {
    payment?: { entity: GatewayPayment };
    order?: { entity: { id: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number; status: string } };
  };
};

export async function handleRazorpayWebhook(rawBody: string, signature: string | null, eventIdHeader: string | null) {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured");
    throw new AppError("PAYMENTS_NOT_CONFIGURED", "Webhooks are not configured.");
  }
  if (!verifyWebhookSignature({ rawBody, signature, secret })) {
    logger.warn("Rejected webhook with invalid signature");
    throw new AppError("FORBIDDEN", "Invalid webhook signature.");
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    throw new AppError("VALIDATION", "Malformed webhook payload.");
  }
  const gatewayEventId = eventIdHeader ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id ?? "unknown"}`;

  // Idempotency: the unique gateway_event_id means a replayed webhook is recorded once.
  const existing = await db.paymentWebhook.findUnique({ where: { gatewayEventId } });
  if (existing && (existing.status === "PROCESSED" || existing.status === "IGNORED")) {
    logger.info("Duplicate webhook ignored", { gatewayEventId, type: body.event });
    return { duplicate: true };
  }
  const record =
    existing ??
    (await db.paymentWebhook
      .create({ data: { gatewayEventId, eventType: body.event, payload: body as unknown as Json } })
      .catch(async () => db.paymentWebhook.findUniqueOrThrow({ where: { gatewayEventId } })));

  try {
    const handled = await processWebhook(body);
    await db.paymentWebhook.update({
      where: { id: record.id },
      data: { status: handled ? "PROCESSED" : "IGNORED", processedAt: new Date(), error: null },
    });
    logger.info("Webhook processed", { gatewayEventId, type: body.event, handled });
    return { duplicate: false, handled };
  } catch (err) {
    await db.paymentWebhook.update({ where: { id: record.id }, data: { status: "FAILED", error: String(err).slice(0, 500) } });
    logger.error("Webhook processing failed", { gatewayEventId, type: body.event, error: err });
    throw err; // non-2xx → Razorpay retries
  }
}

async function processWebhook(body: WebhookBody): Promise<boolean> {
  const p = body.payload.payment?.entity;
  switch (body.event) {
    case "payment.captured":
    case "order.paid": {
      if (!p) return false;
      const payment = await db.payment.findUnique({ where: { razorpayOrderId: p.order_id } });
      if (!payment) return false;
      if (p.amount !== payment.amount || p.currency !== payment.currency) {
        logger.error("Webhook amount mismatch", { paymentId: payment.id, amount: p.amount });
        return false;
      }
      await markPaymentCaptured(payment.id, p, "webhook");
      return true;
    }
    case "payment.authorized": {
      if (!p) return false;
      const payment = await db.payment.findUnique({ where: { razorpayOrderId: p.order_id } });
      if (!payment || payment.status !== "CREATED" || p.amount !== payment.amount) return false;
      await gateway.capturePayment(p.id, p.amount, p.currency); // a payment.captured webhook follows
      return true;
    }
    case "payment.failed": {
      if (!p) return false;
      await markPaymentFailed(p.order_id, p);
      return true;
    }
    case "refund.processed":
    case "refund.failed": {
      const r = body.payload.refund?.entity;
      if (!r) return false;
      await applyRefundResult(r.payment_id, r.id, r.amount, body.event === "refund.processed");
      return true;
    }
    default:
      return false;
  }
}

// ─── Refunds ───────────────────────────────────────────────

async function applyRefundResult(razorpayPaymentId: string, refundId: string, amount: number, processed: boolean) {
  const payment = await db.payment.findUnique({ where: { razorpayPaymentId }, include: { registration: { select: { event: { select: { title: true } } } } } });
  if (!payment) return;
  if (processed && payment.refundStatus === "PROCESSED") return; // idempotent
  await db.payment.update({
    where: { id: payment.id },
    data: processed
      ? {
          refundStatus: "PROCESSED",
          razorpayRefundId: refundId,
          refundAmount: Math.min(payment.amount, amount),
          refundedAt: new Date(),
          status: amount >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
        }
      : { refundStatus: "FAILED", razorpayRefundId: refundId },
  });
  await notify([payment.userId], {
    type: "REFUND_UPDATE",
    title: processed ? "Refund processed" : "Refund failed",
    body: processed
      ? `${formatMoney(amount, payment.currency)} for ${payment.registration.event.title} has been refunded. It may take 5–7 working days to reflect.`
      : `The refund for ${payment.registration.event.title} could not be processed. The organizer has been notified.`,
    link: `/my/payments/${payment.id}`,
    email: processed,
  });
}

async function autoRefund(paymentId: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (!p.razorpayPaymentId || p.refundStatus === "PENDING" || p.refundStatus === "PROCESSED") return;
  const refund = await gateway.refund(p.razorpayPaymentId, p.amount, { reason: p.refundReason ?? "Automatic refund", paymentId: p.id });
  await db.payment.update({ where: { id: p.id }, data: { refundStatus: "PENDING", razorpayRefundId: refund.id, refundAmount: 0 } });
  await audit({ actorId: null, action: "payment.refund_initiated", entityType: "payment", entityId: p.id, metadata: { automatic: true, amount: p.amount } });
}

/** Organizer/admin initiated refund (full or partial, in paise). */
export async function refundPayment(actor: SessionUser, paymentId: string, input: { amount?: number; reason: string }) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { registration: true } });
  if (!payment) throw notFound("Payment");
  await requireEventAccess(actor, payment.eventId, "canManage");
  if (payment.mode === "DEMO") throw new AppError("CONFLICT", "Demo payments cannot be refunded through the gateway.");
  if (payment.status !== "CAPTURED") throw new AppError("CONFLICT", "Only successful payments can be refunded.");
  if (payment.refundStatus === "PENDING" || payment.refundStatus === "PROCESSED") throw new AppError("CONFLICT", "A refund is already in progress for this payment.");
  if (!payment.razorpayPaymentId) throw new AppError("CONFLICT", "This payment has no gateway reference.");
  const amount = input.amount ? Math.round(input.amount) : payment.amount;
  if (amount <= 0 || amount > payment.amount) throw new AppError("VALIDATION", "Refund amount must be between ₹1 and the amount paid.", { fieldErrors: { amount: "Invalid amount" } });

  const refund = await gateway.refund(payment.razorpayPaymentId, amount, { reason: input.reason, paymentId: payment.id });
  await db.$transaction([
    db.payment.update({ where: { id: payment.id }, data: { refundStatus: "PENDING", razorpayRefundId: refund.id, refundReason: input.reason } }),
    ...(payment.registration.status === "CONFIRMED" && amount === payment.amount
      ? [
          db.registration.update({
            where: { id: payment.registrationId },
            data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: `Refunded: ${input.reason}` },
          }),
        ]
      : []),
  ]);
  await audit({ actorId: actor.id, action: "payment.refunded", entityType: "payment", entityId: payment.id, metadata: { amount, reason: input.reason } });
  await publishEventStats(payment.eventId);
  return { refundId: refund.id };
}

// ─── Queries ───────────────────────────────────────────────

export async function getMyPayment(actor: SessionUser, paymentId: string) {
  const p = await db.payment.findFirst({
    where: { id: paymentId, userId: actor.id },
    include: {
      registration: { select: { id: true, code: true, participantName: true, participantEmail: true, status: true } },
      event: { select: { title: true, slug: true, startsAt: true, college: { select: { name: true } } } },
    },
  });
  if (!p) throw notFound("Payment");
  return p;
}

export async function listMyPayments(actor: SessionUser) {
  return db.payment.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    include: { event: { select: { title: true, slug: true } }, registration: { select: { code: true } } },
    take: 100,
  });
}

export async function listPayments(
  actor: SessionUser,
  f: { eventId?: string; status?: string; refund?: string; q?: string; page?: number; pageSize?: number } = {},
) {
  if (f.eventId) await requireEventAccess(actor, f.eventId, "canView");
  else if (actor.role !== "SUPER_ADMIN" && actor.role !== "COLLEGE_ADMIN") throw new AppError("FORBIDDEN", "You don't have access to all payments.");
  const pageSize = Math.min(f.pageSize ?? 25, 200);
  const page = Math.max(f.page ?? 1, 1);
  const where: Prisma.PaymentWhereInput = {
    ...(f.eventId ? { eventId: f.eventId } : { event: collegeScope(actor) }),
    ...(f.status && f.status !== "all" ? { status: f.status as "CAPTURED" } : {}),
    ...(f.refund && f.refund !== "all" ? { refundStatus: f.refund as "REQUESTED" } : {}),
    ...(f.q
      ? {
          OR: [
            { razorpayPaymentId: { contains: f.q.trim() } },
            { razorpayOrderId: { contains: f.q.trim() } },
            { receipt: { contains: f.q.trim() } },
            { registration: { participantName: { contains: f.q.trim(), mode: "insensitive" } } },
            { registration: { code: { contains: f.q.trim().toUpperCase() } } },
          ],
        }
      : {}),
  };
  const [total, items, sums] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        event: { select: { id: true, title: true } },
        registration: { select: { code: true, participantName: true, participantEmail: true } },
      },
    }),
    db.payment.aggregate({
      where: { ...where, status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] } },
      _sum: { amount: true, refundAmount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    total,
    items,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    summary: { gross: sums._sum.amount ?? 0, refunded: sums._sum.refundAmount ?? 0, count: sums._count._all },
  };
}
