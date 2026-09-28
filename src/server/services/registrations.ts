import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { friendlyCode, randomToken } from "../crypto";
import { notify } from "../notifications";
import { publish, publishEventStats } from "../realtime";
import { assertCan, requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { isRegistrationOpen } from "@/lib/event-status";
import { registrationSubmitSchema } from "@/lib/validators";
import { formatDateRange } from "@/lib/utils";
import { lockEvent, seatsTaken } from "./events";
import { getSettings } from "./settings";

export type RegisterResult = {
  registrationId: string;
  code: string;
  status: "CONFIRMED" | "PENDING_PAYMENT";
  requiresPayment: boolean;
  holdExpiresAt: Date | null;
};

/**
 * Registers the student for an event.
 *
 * Concurrency: the event row is locked (SELECT … FOR UPDATE) for the whole
 * transaction, so concurrent registrations for the same event are serialised
 * and the seat count read inside the lock is exact. Paid registrations take a
 * time-limited *hold* on a seat instead of a permanent seat; an expired hold
 * stops counting automatically, so abandoned/failed payments never consume
 * capacity permanently. The (event_id, user_id) unique constraint is the
 * last line of defence against duplicates.
 */
export async function registerForEvent(actor: SessionUser, raw: unknown): Promise<RegisterResult> {
  assertCan(actor, "events:register", "Only student accounts can register for events.");
  const input = registrationSubmitSchema.parse(raw);
  const settings = await getSettings();
  const now = new Date();

  const profile = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      name: true, email: true, phone: true, year: true, studentId: true,
      college: { select: { name: true } }, department: { select: { name: true } },
    },
  });

  const result = await db.$transaction(
    async (tx) => {
      await lockEvent(tx, input.eventId);
      const event = await tx.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        include: { questions: true, college: { select: { status: true } } },
      });
      if (!event || event.college.status !== "ACTIVE") throw notFound("Event");
      if (!isRegistrationOpen(event, now)) {
        throw new AppError("REGISTRATION_CLOSED", "Registration for this event is closed.");
      }

      const existing = await tx.registration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: actor.id } } });
      if (existing?.status === "CONFIRMED") {
        throw new AppError("ALREADY_REGISTERED", "You're already registered for this event.", { details: { registrationId: existing.id } });
      }
      if (existing?.status === "PENDING_PAYMENT" && existing.holdExpiresAt && existing.holdExpiresAt > now) {
        // Resume the in-progress payment instead of creating a second hold.
        return { reg: existing, event, reused: true };
      }

      // Validate required profile fields and custom questions (server is authoritative).
      const fieldErrors: Record<string, string> = {};
      const phone = input.phone ?? profile.phone ?? undefined;
      const studentId = input.studentId ?? profile.studentId ?? undefined;
      const departmentName = input.departmentName ?? profile.department?.name ?? undefined;
      const year = input.year ?? profile.year ?? undefined;
      if (event.requiredFields.includes("phone") && !phone) fieldErrors.phone = "Phone number is required";
      if (event.requiredFields.includes("studentId") && !studentId) fieldErrors.studentId = "Student ID is required";
      if (event.requiredFields.includes("department") && !departmentName) fieldErrors.departmentName = "Department is required";
      if (event.requiredFields.includes("year") && !year) fieldErrors.year = "Year of study is required";

      const answers: { questionId: string; value: string }[] = [];
      for (const q of event.questions) {
        const value = (input.answers[q.id] ?? "").trim();
        if (!value) {
          if (q.required && q.type !== "CHECKBOX") fieldErrors[`answers.${q.id}`] = "This question is required";
          if (q.required && q.type === "CHECKBOX") fieldErrors[`answers.${q.id}`] = "You must accept to continue";
          continue;
        }
        if (q.type === "NUMBER" && !Number.isFinite(Number(value))) fieldErrors[`answers.${q.id}`] = "Enter a number";
        if (q.type === "SELECT" && !q.options.includes(value)) fieldErrors[`answers.${q.id}`] = "Choose one of the options";
        if (q.type === "CHECKBOX" && value !== "true") continue;
        answers.push({ questionId: q.id, value: value.slice(0, 2000) });
      }
      if (Object.keys(fieldErrors).length) {
        throw new AppError("VALIDATION", "Please complete the required registration details.", { fieldErrors });
      }

      const taken = await seatsTaken(event.id, tx, existing?.id);
      if (taken >= event.capacity) {
        throw new AppError("EVENT_FULL", "Registration could not be completed because this event is already full.");
      }

      const paid = event.feeAmount > 0;
      const data = {
        status: paid ? ("PENDING_PAYMENT" as const) : ("CONFIRMED" as const),
        holdExpiresAt: paid ? new Date(now.getTime() + settings.seatHoldMinutes * 60_000) : null,
        amount: event.feeAmount,
        confirmedAt: paid ? null : now,
        cancelledAt: null,
        cancelReason: null,
        participantName: profile.name,
        participantEmail: profile.email,
        participantPhone: phone ?? null,
        collegeName: profile.college?.name ?? null,
        departmentName: departmentName ?? null,
        year: year ?? null,
        studentId: studentId ?? null,
      } satisfies Prisma.RegistrationUpdateInput;

      // Re-registering after a cancellation/expiry reuses the row (keeps the unique constraint strict).
      const reg = existing
        ? await tx.registration.update({ where: { id: existing.id }, data: { ...data, qrToken: randomToken(24) } })
        : await tx.registration.create({
            data: { ...data, eventId: event.id, userId: actor.id, code: `REG-${friendlyCode(8)}`, qrToken: randomToken(24) },
          });

      await tx.registrationAnswer.deleteMany({ where: { registrationId: reg.id } });
      if (answers.length) {
        await tx.registrationAnswer.createMany({ data: answers.map((a) => ({ ...a, registrationId: reg.id })) });
      }

      // Profile back-fill so the student doesn't have to re-enter details next time.
      await tx.user.update({
        where: { id: actor.id },
        data: {
          ...(input.phone && !profile.phone ? { phone: input.phone } : {}),
          ...(input.studentId && !profile.studentId ? { studentId: input.studentId } : {}),
          ...(input.year && !profile.year ? { year: input.year } : {}),
        },
      });
      return { reg, event, reused: false };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );

  const { reg, event, reused } = result;
  if (!reused) {
    await audit({ actorId: actor.id, action: "registration.created", entityType: "registration", entityId: reg.id, metadata: { eventId: event.id, status: reg.status } });
    await publishEventStats(event.id);
    if (reg.status === "CONFIRMED") await onRegistrationConfirmed(reg.id);
  }
  return {
    registrationId: reg.id,
    code: reg.code,
    status: reg.status as "CONFIRMED" | "PENDING_PAYMENT",
    requiresPayment: reg.status === "PENDING_PAYMENT",
    holdExpiresAt: reg.holdExpiresAt,
  };
}

/** Side effects once a registration becomes CONFIRMED (free or after payment). */
export async function onRegistrationConfirmed(registrationId: string): Promise<void> {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    select: { id: true, code: true, userId: true, event: { select: { id: true, title: true, startsAt: true, endsAt: true, venueName: true } } },
  });
  if (!reg) return;
  await notify([reg.userId], {
    type: "REGISTRATION_CONFIRMED",
    title: `You're registered for ${reg.event.title}`,
    body: `Registration ${reg.code} is confirmed for ${formatDateRange(reg.event.startsAt, reg.event.endsAt)}${reg.event.venueName ? ` at ${reg.event.venueName}` : ""}. Show your QR pass at the entrance.`,
    link: `/my/registrations/${reg.id}`,
    email: true,
    emailCta: "View your QR pass",
  });
  await publish(`user:${reg.userId}`, { kind: "registration", registrationId: reg.id, status: "CONFIRMED" });
}

/** Student-initiated cancellation. Paid registrations get a refund request for the organizer. */
export async function cancelOwnRegistration(actor: SessionUser, registrationId: string) {
  const reg = await db.registration.findFirst({
    where: { id: registrationId, userId: actor.id },
    include: { event: { select: { id: true, title: true, startsAt: true, organizerId: true } }, attendance: { select: { id: true } } },
  });
  if (!reg) throw notFound("Registration");
  if (reg.status !== "CONFIRMED" && reg.status !== "PENDING_PAYMENT") {
    throw new AppError("CONFLICT", "This registration is no longer active.");
  }
  if (reg.attendance) throw new AppError("CONFLICT", "You've already checked in to this event, so the registration can't be cancelled.");
  if (reg.event.startsAt <= new Date()) throw new AppError("CONFLICT", "Registrations can't be cancelled after the event has started.");

  await db.$transaction([
    db.registration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Cancelled by participant", holdExpiresAt: null },
    }),
    db.payment.updateMany({
      where: { registrationId: reg.id, status: "CAPTURED", refundStatus: "NONE" },
      data: { refundStatus: "REQUESTED", refundReason: "Cancelled by participant" },
    }),
  ]);
  await audit({ actorId: actor.id, action: "registration.cancelled", entityType: "registration", entityId: reg.id, metadata: { by: "participant" } });
  await publishEventStats(reg.event.id);
  return { refundRequested: reg.status === "CONFIRMED" && reg.amount > 0 };
}

/** Organizer/admin cancellation of a participant's registration. */
export async function cancelRegistrationAsStaff(actor: SessionUser, registrationId: string, reason: string) {
  const reg = await db.registration.findUnique({ where: { id: registrationId }, include: { event: { select: { id: true, title: true, slug: true } } } });
  if (!reg) throw notFound("Registration");
  await requireEventAccess(actor, reg.eventId, "canManage");
  if (reg.status !== "CONFIRMED" && reg.status !== "PENDING_PAYMENT") throw new AppError("CONFLICT", "This registration is no longer active.");
  if (!reason.trim()) throw new AppError("VALIDATION", "Please provide a reason.", { fieldErrors: { reason: "Reason is required" } });

  await db.$transaction([
    db.registration.update({
      where: { id: reg.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, holdExpiresAt: null },
    }),
    db.payment.updateMany({
      where: { registrationId: reg.id, status: "CAPTURED", refundStatus: "NONE" },
      data: { refundStatus: "REQUESTED", refundReason: reason },
    }),
  ]);
  await notify([reg.userId], {
    type: "EVENT_UPDATE",
    title: `Registration cancelled: ${reg.event.title}`,
    body: `Your registration ${reg.code} was cancelled by the organizer. Reason: ${reason}`,
    link: `/my/registrations/${reg.id}`,
    email: true,
  });
  await audit({ actorId: actor.id, action: "registration.cancelled", entityType: "registration", entityId: reg.id, metadata: { by: "staff", reason } });
  await publishEventStats(reg.eventId);
}

/** Marks stale payment holds as EXPIRED (cosmetic — expired holds already don't count). */
export async function expireStaleHolds(now = new Date()): Promise<number> {
  const stale = await db.registration.findMany({
    where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    select: { id: true, eventId: true },
    take: 1000,
  });
  if (!stale.length) return 0;
  // Only expire holds with no captured payment (a late webhook may still confirm them).
  const res = await db.registration.updateMany({
    where: { id: { in: stale.map((s) => s.id) }, status: "PENDING_PAYMENT", payments: { none: { status: "CAPTURED" } } },
    data: { status: "EXPIRED" },
  });
  for (const eventId of new Set(stale.map((s) => s.eventId))) await publishEventStats(eventId);
  return res.count;
}

// ─── Queries ───────────────────────────────────────────────

export async function getMyRegistration(actor: SessionUser, registrationId: string) {
  const reg = await db.registration.findFirst({
    where: { id: registrationId, userId: actor.id },
    include: {
      event: {
        select: {
          id: true, slug: true, title: true, startsAt: true, endsAt: true, venueName: true, venueAddress: true, city: true,
          onlineUrl: true, mode: true, status: true, bannerUrl: true, feeAmount: true, currency: true, refundPolicy: true,
          registrationDeadline: true, registrationOpensAt: true,
          college: { select: { name: true } },
        },
      },
      payments: { orderBy: { createdAt: "desc" } },
      attendance: true,
      certificates: { where: { status: "ISSUED" }, select: { id: true, code: true, type: true, issuedAt: true } },
      feedback: { select: { id: true, overall: true, createdAt: true } },
      answers: { include: { question: { select: { label: true } } } },
    },
  });
  if (!reg) throw notFound("Registration");
  return reg;
}

export async function listMyRegistrations(actor: SessionUser, f: { status?: "upcoming" | "past" | "cancelled" | "all" } = {}) {
  const now = new Date();
  const where: Prisma.RegistrationWhereInput = { userId: actor.id };
  if (f.status === "upcoming") Object.assign(where, { status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, event: { endsAt: { gte: now } } });
  if (f.status === "past") Object.assign(where, { status: "CONFIRMED", event: { endsAt: { lt: now } } });
  if (f.status === "cancelled") Object.assign(where, { status: { in: ["CANCELLED", "EXPIRED", "FAILED"] } });
  return db.registration.findMany({
    where,
    orderBy: { event: { startsAt: f.status === "past" ? "desc" : "asc" } },
    include: {
      event: {
        select: {
          id: true, slug: true, title: true, startsAt: true, endsAt: true, venueName: true, city: true, mode: true, status: true, bannerUrl: true,
          category: { select: { name: true, color: true } },
          college: { select: { shortName: true, name: true } },
        },
      },
      attendance: { select: { checkInAt: true } },
      feedback: { select: { id: true } },
      certificates: { where: { status: "ISSUED" }, select: { code: true, type: true } },
      payments: { select: { status: true, refundStatus: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: 200,
  });
}

export async function listEventRegistrations(
  actor: SessionUser,
  eventId: string,
  f: { q?: string; status?: string; attendance?: "present" | "absent"; page?: number; pageSize?: number } = {},
) {
  await requireEventAccess(actor, eventId, "canView");
  const pageSize = Math.min(f.pageSize ?? 25, 200);
  const page = Math.max(f.page ?? 1, 1);
  const q = f.q?.trim();
  const where: Prisma.RegistrationWhereInput = {
    eventId,
    ...(f.status && f.status !== "all" ? { status: f.status as "CONFIRMED" } : {}),
    ...(f.attendance === "present" ? { attendance: { isNot: null } } : {}),
    ...(f.attendance === "absent" ? { attendance: { is: null }, status: "CONFIRMED" } : {}),
    ...(q
      ? {
          OR: [
            { participantName: { contains: q, mode: "insensitive" } },
            { participantEmail: { contains: q, mode: "insensitive" } },
            { code: { contains: q.toUpperCase() } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    db.registration.count({ where }),
    db.registration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        attendance: { select: { checkInAt: true, method: true } },
        payments: { select: { id: true, status: true, amount: true, refundStatus: true, mode: true }, orderBy: { createdAt: "desc" }, take: 1 },
        certificates: { where: { status: "ISSUED" }, select: { code: true, type: true } },
      },
    }),
  ]);
  return { total, items, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
