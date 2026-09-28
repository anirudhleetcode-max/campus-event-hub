import "server-only";
import { db } from "../db";
import { AppError, isUniqueViolation, notFound } from "../errors";
import { audit } from "../audit";
import { notify } from "../notifications";
import { publish, publishEventStats } from "../realtime";
import { requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";

/** QR payload format. The token is random and carries no personal data. */
export const QR_PREFIX = "CEH1:";

export function parseQrPayload(payload: string): string | null {
  const v = payload.trim();
  const token = v.startsWith(QR_PREFIX) ? v.slice(QR_PREFIX.length) : v;
  return /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
}

const CHECK_IN_EARLY_MS = 24 * 60 * 60 * 1000;
const CHECK_IN_LATE_MS = 24 * 60 * 60 * 1000;

export type CheckInResult = {
  status: "checked_in";
  registration: { id: string; code: string; participantName: string; checkInAt: Date };
};

/**
 * Validates a scanned QR pass and records attendance.
 * Rejects: malformed/unknown tokens, passes for another event, cancelled or
 * unpaid registrations, events outside the check-in window, and duplicates
 * (enforced by the unique registration_id constraint on attendance).
 */
export async function checkIn(actor: SessionUser, eventId: string, payload: string, method: "QR" | "MANUAL" = "QR"): Promise<CheckInResult> {
  const { event } = await requireEventAccess(actor, eventId, "canScan");
  const token = parseQrPayload(payload);
  if (!token) throw new AppError("INVALID_QR", "This QR code is not a valid Campus Event Hub pass.");

  const reg = await db.registration.findUnique({
    where: { qrToken: token },
    include: { attendance: true, event: { select: { id: true, title: true, startsAt: true, endsAt: true, status: true } } },
  });
  if (!reg) {
    await audit({ actorId: actor.id, action: "attendance.invalid_qr", entityType: "event", entityId: eventId });
    throw new AppError("INVALID_QR", "Pass not recognised. It may be forged or was replaced by a newer pass.");
  }
  if (reg.eventId !== event.id) {
    throw new AppError("INVALID_QR", `This pass is for a different event (${reg.event.title}).`);
  }
  if (reg.status === "PENDING_PAYMENT") throw new AppError("INVALID_QR", "Payment for this registration is incomplete. Entry not allowed.");
  if (reg.status !== "CONFIRMED") throw new AppError("INVALID_QR", `This registration is ${reg.status.toLowerCase()}. Entry not allowed.`);
  if (["CANCELLED", "ARCHIVED", "DRAFT", "PENDING_APPROVAL"].includes(reg.event.status)) {
    throw new AppError("INVALID_QR", "Check-in is not available for this event.");
  }
  const now = Date.now();
  if (now < reg.event.startsAt.getTime() - CHECK_IN_EARLY_MS || now > reg.event.endsAt.getTime() + CHECK_IN_LATE_MS) {
    throw new AppError("INVALID_QR", "Check-in is only open around the event dates.");
  }
  if (reg.attendance) {
    throw new AppError("ALREADY_CHECKED_IN", `${reg.participantName} already checked in.`, {
      details: { checkInAt: reg.attendance.checkInAt.toISOString(), participantName: reg.participantName, code: reg.code },
    });
  }

  let attendance;
  try {
    attendance = await db.attendance.create({
      data: { registrationId: reg.id, eventId: reg.eventId, userId: reg.userId, markedById: actor.id, method },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a race with another scanner for the same pass.
      throw new AppError("ALREADY_CHECKED_IN", `${reg.participantName} already checked in.`, {
        details: { participantName: reg.participantName, code: reg.code },
      });
    }
    throw err;
  }

  await audit({ actorId: actor.id, action: "attendance.marked", entityType: "registration", entityId: reg.id, metadata: { method } });
  await publish(`event:${eventId}:attendance`, {
    kind: "checkin",
    last: { name: reg.participantName, code: reg.code, at: attendance.checkInAt.toISOString() },
  });
  await publishEventStats(eventId);
  await notify([reg.userId], {
    type: "ATTENDANCE_CONFIRMED",
    title: `Checked in: ${reg.event.title}`,
    body: "Your attendance has been recorded. Enjoy the event!",
    link: `/my/registrations/${reg.id}`,
  });
  return { status: "checked_in", registration: { id: reg.id, code: reg.code, participantName: reg.participantName, checkInAt: attendance.checkInAt } };
}

/** Manual check-in by registration ID (for participants without their phone). */
export async function checkInByRegistration(actor: SessionUser, eventId: string, registrationId: string) {
  const reg = await db.registration.findFirst({ where: { id: registrationId, eventId }, select: { qrToken: true } });
  if (!reg) throw notFound("Registration");
  return checkIn(actor, eventId, reg.qrToken, "MANUAL");
}

/** Undo an incorrect check-in (audited). */
export async function removeAttendance(actor: SessionUser, eventId: string, registrationId: string, reason: string) {
  await requireEventAccess(actor, eventId, "canManage");
  const att = await db.attendance.findUnique({ where: { registrationId } });
  if (!att || att.eventId !== eventId) throw notFound("Attendance record");
  await db.attendance.delete({ where: { id: att.id } });
  await audit({ actorId: actor.id, action: "attendance.removed", entityType: "registration", entityId: registrationId, metadata: { reason } });
  await publishEventStats(eventId);
}

export async function checkOut(actor: SessionUser, eventId: string, registrationId: string) {
  await requireEventAccess(actor, eventId, "canScan");
  const att = await db.attendance.findUnique({ where: { registrationId } });
  if (!att || att.eventId !== eventId) throw notFound("Attendance record");
  if (att.checkOutAt) throw new AppError("CONFLICT", "Already checked out.");
  await db.attendance.update({ where: { id: att.id }, data: { checkOutAt: new Date() } });
  await audit({ actorId: actor.id, action: "attendance.checkout", entityType: "registration", entityId: registrationId });
}

export async function attendanceSummary(actor: SessionUser, eventId: string) {
  await requireEventAccess(actor, eventId, "canScan");
  const [registered, checkedIn, recent] = await Promise.all([
    db.registration.count({ where: { eventId, status: "CONFIRMED" } }),
    db.attendance.count({ where: { eventId } }),
    db.attendance.findMany({
      where: { eventId },
      orderBy: { checkInAt: "desc" },
      take: 10,
      select: { checkInAt: true, method: true, registration: { select: { participantName: true, code: true } }, markedBy: { select: { name: true } } },
    }),
  ]);
  return { registered, checkedIn, notCheckedIn: Math.max(0, registered - checkedIn), rate: registered ? checkedIn / registered : 0, recent };
}
