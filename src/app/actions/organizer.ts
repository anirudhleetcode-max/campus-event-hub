"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { requireUser } from "@/server/auth/session";
import { requireEventAccess } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { createEvent, duplicateEvent, transitionEvent, updateEvent } from "@/server/services/events";
import { cancelRegistrationAsStaff } from "@/server/services/registrations";
import { checkInByRegistration, removeAttendance } from "@/server/services/attendance";
import { refundPayment } from "@/server/services/payments";
import { issueCertificates, revokeCertificate } from "@/server/services/certificates";
import { addEventStaff, removeEventStaff } from "@/server/services/users";
import { sendAnnouncement } from "@/server/services/communications";
import { isEventAction } from "@/lib/event-status";
import { emailSchema, refundSchema, type EventFormValues } from "@/lib/validators";
import type { ScanOutcome } from "@/components/scanner/types";

const uuid = z.uuid();
const reasonSchema = z.string().trim().max(300, "Reason must be at most 300 characters");

function eventPaths(eventId: string) {
  revalidatePath(`/organizer/events/${eventId}`, "layout");
  revalidatePath("/organizer/events");
  revalidatePath("/organizer/dashboard");
}

// ─── Events ────────────────────────────────────────────────

export async function saveEventAction(input: { eventId?: string; collegeId?: string; values: EventFormValues }) {
  return runAction(async () => {
    const user = await requireUser();
    if (input.eventId) {
      const res = await updateEvent(user, uuid.parse(input.eventId), input.values);
      eventPaths(res.id);
      return { id: res.id, slug: res.slug, created: false };
    }
    const collegeId = input.collegeId ? uuid.parse(input.collegeId) : undefined;
    const res = await createEvent(user, input.values, { collegeId });
    revalidatePath("/organizer/events");
    revalidatePath("/organizer/dashboard");
    return { id: res.id, slug: res.slug, created: true };
  });
}

/** Publishes the event, or submits it for approval when the college requires it and the user can't approve. */
export async function publishOrSubmitAction(eventId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const id = uuid.parse(eventId);
    const { access } = await requireEventAccess(user, id, "canManage");
    const event = await db.event.findUniqueOrThrow({ where: { id }, select: { college: { select: { requireEventApproval: true } } } });
    const action = event.college.requireEventApproval && !access.canApprove ? "submit" : "publish";
    const res = await transitionEvent(user, id, action);
    eventPaths(id);
    return { action, status: res.status };
  });
}

export async function transitionEventAction(eventId: string, action: string, reason?: string) {
  return runAction(async () => {
    const user = await requireUser();
    if (!isEventAction(action)) throw new AppError("VALIDATION", "Unknown event action.");
    const id = uuid.parse(eventId);
    const res = await transitionEvent(user, id, action, { reason: reason ? reasonSchema.parse(reason) : undefined });
    eventPaths(id);
    return res;
  });
}

export async function duplicateEventAction(eventId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const copy = await duplicateEvent(user, uuid.parse(eventId));
    revalidatePath("/organizer/events");
    return copy;
  }, "Event duplicated as a draft.");
}

// ─── Staff & announcements ─────────────────────────────────

const staffSchema = z.object({
  email: emailSchema,
  role: z.enum(["VOLUNTEER", "CO_ORGANIZER", "FACULTY_COORDINATOR"]),
  canScan: z.boolean(),
});

export async function addStaffAction(eventId: string, raw: { email: string; role: string; canScan: boolean }) {
  return runAction(async () => {
    const user = await requireUser();
    const input = staffSchema.parse(raw);
    const id = uuid.parse(eventId);
    const added = await addEventStaff(user, id, input.email, input.role, input.canScan);
    revalidatePath(`/organizer/events/${id}`);
    return { name: added.name };
  });
}

export async function removeStaffAction(eventId: string, userId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const id = uuid.parse(eventId);
    await removeEventStaff(user, id, uuid.parse(userId));
    revalidatePath(`/organizer/events/${id}`);
    return null;
  }, "Staff member removed.");
}

export async function sendEventAnnouncementAction(eventId: string, raw: { title: string; body: string; sendEmail: boolean }) {
  return runAction(async () => {
    const user = await requireUser();
    return sendAnnouncement(user, { ...raw, audience: "EVENT_PARTICIPANTS", eventId: uuid.parse(eventId) });
  });
}

// ─── Registrations & attendance ────────────────────────────

export async function cancelRegistrationAction(eventId: string, registrationId: string, reason: string) {
  return runAction(async () => {
    const user = await requireUser();
    await cancelRegistrationAsStaff(user, uuid.parse(registrationId), reasonSchema.parse(reason));
    eventPaths(uuid.parse(eventId));
    return null;
  }, "Registration cancelled. The participant has been notified.");
}

export async function manualCheckInAction(eventId: string, registrationId: string) {
  return runAction(async () => {
    const user = await requireUser();
    const id = uuid.parse(eventId);
    const res = await checkInByRegistration(user, id, uuid.parse(registrationId));
    eventPaths(id);
    return { name: res.registration.participantName };
  });
}

const regCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((v) => (v.startsWith("REG-") ? v : `REG-${v}`))
  .pipe(z.string().regex(/^REG-[A-Z0-9]{4,16}$/, "Enter a registration ID like REG-7KD2QX9M"));

/** Manual fallback for the scanner: check in by the human-readable registration ID. */
export async function checkInByCodeAction(eventId: string, code: string) {
  return runAction(async (): Promise<ScanOutcome> => {
    const user = await requireUser();
    const id = uuid.parse(eventId);
    await requireEventAccess(user, id, "canScan");
    const parsed = regCodeSchema.safeParse(code);
    if (!parsed.success) throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "Enter a valid registration ID.");
    const reg = await db.registration.findFirst({ where: { eventId: id, code: parsed.data }, select: { id: true } });
    if (!reg) throw new AppError("NOT_FOUND", `No registration ${parsed.data} was found for this event.`);
    try {
      const res = await checkInByRegistration(user, id, reg.id);
      return { kind: "success", name: res.registration.participantName, code: res.registration.code, at: res.registration.checkInAt.toISOString() };
    } catch (err) {
      if (err instanceof AppError && err.code === "ALREADY_CHECKED_IN") {
        const d = err.details ?? {};
        return {
          kind: "already",
          message: err.message,
          name: typeof d.participantName === "string" ? d.participantName : "",
          code: typeof d.code === "string" ? d.code : parsed.data,
          at: typeof d.checkInAt === "string" ? d.checkInAt : undefined,
        };
      }
      throw err;
    }
  });
}

export async function removeAttendanceAction(eventId: string, registrationId: string, reason: string) {
  return runAction(async () => {
    const user = await requireUser();
    const id = uuid.parse(eventId);
    const why = reasonSchema.parse(reason);
    if (!why) throw new AppError("VALIDATION", "Please provide a reason.", { fieldErrors: { reason: "Reason is required" } });
    await removeAttendance(user, id, uuid.parse(registrationId), why);
    eventPaths(id);
    return null;
  }, "Check-in removed.");
}

// ─── Payments ──────────────────────────────────────────────

export async function refundPaymentAction(eventId: string, raw: { paymentId: string; amount?: string; reason: string }) {
  return runAction(async () => {
    const user = await requireUser();
    const input = refundSchema.parse({ paymentId: raw.paymentId, amount: raw.amount?.trim() ? raw.amount : undefined, reason: raw.reason });
    const res = await refundPayment(user, input.paymentId, {
      amount: input.amount !== undefined ? Math.round(input.amount * 100) : undefined,
      reason: input.reason,
    });
    eventPaths(uuid.parse(eventId));
    return res;
  }, "Refund initiated. The participant will be notified once it is processed.");
}

// ─── Certificates ──────────────────────────────────────────

export async function issueCertificatesAction(raw: { eventId: string; type: string; userIds?: string[]; position?: string }) {
  return runAction(async () => {
    const user = await requireUser();
    const res = await issueCertificates(user, raw);
    eventPaths(uuid.parse(raw.eventId));
    return res;
  });
}

export async function revokeCertificateAction(eventId: string, certificateId: string, reason: string) {
  return runAction(async () => {
    const user = await requireUser();
    await revokeCertificate(user, uuid.parse(certificateId), reasonSchema.parse(reason));
    eventPaths(uuid.parse(eventId));
    return null;
  }, "Certificate revoked.");
}
