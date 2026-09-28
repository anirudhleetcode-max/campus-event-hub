import { beforeEach, describe, expect, it } from "vitest";
import { createEvent, transitionEvent, updateEvent, duplicateEvent, syncEventStatuses } from "@/server/services/events";
import { registerForEvent } from "@/server/services/registrations";
import { checkIn } from "@/server/services/attendance";
import { issueCertificates, verifyCertificate, certificatePdf, revokeCertificate } from "@/server/services/certificates";
import { submitFeedback, eventFeedbackSummary } from "@/server/services/feedback";
import { sendDueReminders } from "@/server/services/reminders";
import { dashboardAnalytics, eventAnalytics, resolveRange } from "@/server/services/analytics";
import { exportCsv } from "@/server/services/exports";
import { AppError } from "@/server/errors";
import type { EventFormValues } from "@/lib/validators";
import { asSession, category, datetimeLocal, makeCollege, makeEvent, makeUser, prisma, resetDb } from "../helpers";

const H = 3_600_000;

async function eventForm(overrides: Record<string, unknown> = {}): Promise<EventFormValues> {
  const start = new Date(Date.now() + 10 * 24 * H);
  return {
    title: "AI Workshop", summary: "Hands-on AI workshop for students", description: "Learn to build things with AI in this workshop session.",
    categoryId: await category(), mode: "IN_PERSON", startsAt: datetimeLocal(start), endsAt: datetimeLocal(new Date(start.getTime() + 3 * H)),
    registrationDeadline: datetimeLocal(new Date(start.getTime() - 24 * H)), venueName: "Hall A", capacity: 30, fee: 0,
    questions: [{ label: "Laptop?", type: "SELECT", options: ["Yes", "No"], required: true }],
    speakers: [{ name: "Dr. Speaker", role: "SPEAKER" }],
    ...overrides,
  } as EventFormValues;
}

describe("event lifecycle & RBAC", () => {
  beforeEach(resetDb);

  it("organizer creates, submits; admin approves → registration opens", async () => {
    const college = await makeCollege({ requireEventApproval: true });
    const org = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const admin = asSession(await makeUser("COLLEGE_ADMIN", college.id));
    const ev = await createEvent(org, await eventForm());
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("DRAFT");
    await expect(transitionEvent(org, ev.id, "publish")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await transitionEvent(org, ev.id, "submit");
    await expect(transitionEvent(org, ev.id, "approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const res = await transitionEvent(admin, ev.id, "approve");
    expect(res.status).toBe("REGISTRATION_OPEN");
    expect(await prisma.auditLog.count({ where: { entityId: ev.id, action: "event.approve" } })).toBe(1);
  });

  it("students cannot create events; organizers cannot touch other organizers' events", async () => {
    const college = await makeCollege();
    const student = asSession(await makeUser("STUDENT", college.id));
    await expect(createEvent(student, await eventForm())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const a = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const b = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const ev = await createEvent(a, await eventForm());
    await expect(updateEvent(b, ev.id, await eventForm())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(transitionEvent(b, ev.id, "publish")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const otherAdmin = asSession(await makeUser("COLLEGE_ADMIN", (await makeCollege()).id));
    await expect(transitionEvent(otherAdmin, ev.id, "publish")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects invalid transitions and protects capacity/fee invariants", async () => {
    const college = await makeCollege();
    const org = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const ev = await createEvent(org, await eventForm({ capacity: 2 }));
    await expect(transitionEvent(org, ev.id, "complete")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await transitionEvent(org, ev.id, "publish");
    const s = asSession(await makeUser("STUDENT", college.id));
    const q = await prisma.eventQuestion.findFirstOrThrow({ where: { eventId: ev.id } });
    await registerForEvent(s, { eventId: ev.id, answers: { [q.id]: "Yes" } });
    await expect(updateEvent(org, ev.id, await eventForm({ capacity: 0 }))).rejects.toBeInstanceOf(Error);
    await expect(updateEvent(org, ev.id, await eventForm({ fee: 100, questions: [{ id: q.id, label: "Laptop?", type: "SELECT", options: ["Yes", "No"], required: true }] }))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(transitionEvent(org, ev.id, "unpublish")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transitionEvent(org, ev.id, "cancel")).rejects.toMatchObject({ code: "VALIDATION" });
    await transitionEvent(org, ev.id, "cancel", { reason: "Weather" });
    expect((await prisma.registration.findFirstOrThrow({ where: { eventId: ev.id } })).status).toBe("CANCELLED");
    expect(await prisma.notification.count({ where: { userId: s.id, type: "EVENT_CANCELLED" } })).toBe(1);
  });

  it("duplicates an event as a draft with questions and speakers", async () => {
    const college = await makeCollege();
    const org = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const ev = await createEvent(org, await eventForm());
    const copy = await duplicateEvent(org, ev.id);
    const c = await prisma.event.findUniqueOrThrow({ where: { id: copy.id }, include: { questions: true, speakers: true } });
    expect(c.status).toBe("DRAFT");
    expect(c.questions).toHaveLength(1);
    expect(c.speakers).toHaveLength(1);
  });
});

describe("attendance, feedback, certificates", () => {
  beforeEach(resetDb);

  async function ongoingEvent() {
    const college = await makeCollege();
    const orgUser = await makeUser("EVENT_ORGANIZER", college.id);
    const event = await makeEvent({ collegeId: college.id, organizerId: orgUser.id, startsInH: 48, deadlineInH: 24, capacity: 10 });
    const student = await makeUser("STUDENT", college.id, { name: "Ada Lovelace" });
    const reg = await registerForEvent(asSession(student), { eventId: event.id });
    // Event starts now
    await prisma.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + 2 * H), status: "ONGOING", registrationDeadline: new Date(Date.now() - 2 * H) } });
    const r = await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } });
    return { college, org: asSession(orgUser), event, student: asSession(student), reg: r };
  }

  it("checks in a valid QR once and rejects duplicates, forgeries and wrong events", async () => {
    const { college, org, event, reg } = await ongoingEvent();
    const ok = await checkIn(org, event.id, `CEH1:${reg.qrToken}`);
    expect(ok.registration.participantName).toBe("Ada Lovelace");
    await expect(checkIn(org, event.id, `CEH1:${reg.qrToken}`)).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
    await expect(checkIn(org, event.id, "CEH1:ffffffffffffffffffffffffffffffff")).rejects.toMatchObject({ code: "INVALID_QR" });
    await expect(checkIn(org, event.id, "garbage")).rejects.toMatchObject({ code: "INVALID_QR" });
    const other = await makeEvent({ collegeId: college.id, organizerId: org.id, startsInH: -1, durationH: 5, deadlineInH: -2, status: "ONGOING" });
    await expect(checkIn(org, other.id, `CEH1:${reg.qrToken}`)).rejects.toMatchObject({ code: "INVALID_QR" });
    expect(await prisma.attendance.count()).toBe(1);
  });

  it("concurrent scans of the same pass record attendance once", async () => {
    const { org, event, reg } = await ongoingEvent();
    const results = await Promise.allSettled([checkIn(org, event.id, reg.qrToken), checkIn(org, event.id, reg.qrToken), checkIn(org, event.id, reg.qrToken)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.attendance.count()).toBe(1);
  });

  it("rejects unpaid and cancelled registrations and unauthorised scanners", async () => {
    const { college, org, event, reg, student } = await ongoingEvent();
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "PENDING_PAYMENT" } });
    await expect(checkIn(org, event.id, reg.qrToken)).rejects.toMatchObject({ code: "INVALID_QR" });
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "CANCELLED" } });
    await expect(checkIn(org, event.id, reg.qrToken)).rejects.toMatchObject({ code: "INVALID_QR" });
    await expect(checkIn(student, event.id, reg.qrToken)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const volunteer = await makeUser("STUDENT", college.id);
    await prisma.eventVolunteer.create({ data: { eventId: event.id, userId: volunteer.id, role: "VOLUNTEER", canScan: true } });
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "CONFIRMED" } });
    await expect(checkIn(asSession(volunteer), event.id, reg.qrToken)).resolves.toMatchObject({ status: "checked_in" });
  });

  it("feedback only after the event, once per participant", async () => {
    const { org, event, reg, student } = await ongoingEvent();
    const fb = { eventId: event.id, overall: 5, organization: 4, venue: 4, speakers: 5, experience: 5, comments: "Great" };
    await expect(submitFeedback(student, fb)).rejects.toMatchObject({ code: "CONFLICT" });
    await checkIn(org, event.id, reg.qrToken);
    await prisma.event.update({ where: { id: event.id }, data: { endsAt: new Date(Date.now() - 1000), status: "COMPLETED" } });
    await submitFeedback(student, fb);
    await expect(submitFeedback(student, fb)).rejects.toMatchObject({ code: "CONFLICT" });
    const summary = await eventFeedbackSummary(org, event.id);
    expect(summary.count).toBe(1);
    expect(summary.averages.overall).toBe(5);
  });

  it("issues certificates to attendees only, verifies publicly, renders PDF, and revokes", async () => {
    const { college, org, event, reg, student } = await ongoingEvent();
    const absent = await makeUser("STUDENT", college.id);
    await prisma.registration.create({ data: { code: "REG-ABSENT22", eventId: event.id, userId: absent.id, status: "CONFIRMED", qrToken: "absenttokenabsenttoken123", participantName: absent.name, participantEmail: absent.email } });
    await expect(issueCertificates(org, { eventId: event.id, type: "PARTICIPATION" })).rejects.toMatchObject({ code: "CONFLICT" });
    await checkIn(org, event.id, reg.qrToken);
    const res = await issueCertificates(org, { eventId: event.id, type: "PARTICIPATION" });
    expect(res.issued).toBe(1);
    const again = await issueCertificates(org, { eventId: event.id, type: "PARTICIPATION" });
    expect(again.issued).toBe(0);
    const cert = await prisma.certificate.findFirstOrThrow();
    expect(cert.userId).toBe(student.id);

    const v = await verifyCertificate(cert.code.toLowerCase());
    expect(v).toMatchObject({ valid: true, recipientName: "Ada Lovelace", typeLabel: "Participation" });
    expect(v).not.toHaveProperty("email");
    expect(await verifyCertificate("CEH-2026-ZZZZZZZZ")).toBeNull();
    expect(await verifyCertificate("../../etc")).toBeNull();

    const pdf = await certificatePdf(student, cert.code);
    expect(Buffer.from(pdf.bytes).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(certificatePdf(asSession(absent), cert.code)).rejects.toBeInstanceOf(AppError);

    await revokeCertificate(org, cert.id, "Issued in error");
    expect((await verifyCertificate(cert.code))?.valid).toBe(false);
  });
});

describe("automation, analytics and exports", () => {
  beforeEach(resetDb);

  it("advances statuses by time and sends reminders idempotently", async () => {
    const college = await makeCollege();
    const org = await makeUser("EVENT_ORGANIZER", college.id);
    const soon = await makeEvent({ collegeId: college.id, organizerId: org.id, startsInH: 20, deadlineInH: 10, status: "PUBLISHED" });
    const s = await makeUser("STUDENT", college.id);
    await registerForEvent(asSession(s), { eventId: soon.id });
    const first = await sendDueReminders();
    const second = await sendDueReminders();
    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(await prisma.notification.count({ where: { userId: s.id, type: "EVENT_REMINDER" } })).toBe(1);
    // 24h and 168h offsets are both logged, only the nearest delivered
    expect(await prisma.reminderLog.count()).toBe(2);

    await prisma.event.update({ where: { id: soon.id }, data: { startsAt: new Date(Date.now() - 2 * H), endsAt: new Date(Date.now() - H), registrationDeadline: new Date(Date.now() - 3 * H) } });
    const sync = await syncEventStatuses();
    expect(sync.completed).toContain(soon.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: soon.id } })).status).toBe("COMPLETED");
  });

  it("computes analytics from the database and exports CSV", async () => {
    const college = await makeCollege();
    const orgUser = await makeUser("EVENT_ORGANIZER", college.id);
    const admin = asSession(await makeUser("COLLEGE_ADMIN", college.id));
    const ev = await makeEvent({ collegeId: college.id, organizerId: orgUser.id, capacity: 10 });
    for (let i = 0; i < 3; i++) await registerForEvent(asSession(await makeUser("STUDENT", college.id)), { eventId: ev.id });
    const dash = await dashboardAnalytics(admin, resolveRange("7d"));
    expect(dash.totals.registrations).toBe(3);
    expect(dash.registrationTrend.reduce((a, p) => a + p.value, 0)).toBe(3);
    const ea = await eventAnalytics(asSession(orgUser), ev.id);
    expect(ea).toMatchObject({ registrations: 3, capacity: 10, conversionRate: 1 });
    const csv = await exportCsv(asSession(orgUser), "registrations", { eventId: ev.id });
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4);
    const outsider = asSession(await makeUser("COLLEGE_ADMIN", (await makeCollege()).id));
    await expect(exportCsv(outsider, "registrations", { eventId: ev.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const otherDash = await dashboardAnalytics(outsider, resolveRange("7d"));
    expect(otherDash.totals.registrations).toBe(0);
  });
});

describe("subscription limits and manual completion", () => {
  beforeEach(resetDb);

  it("enforces the college's active-event limit; archived events free capacity", async () => {
    const college = await makeCollege();
    await prisma.subscription.create({ data: { collegeId: college.id, plan: "FREE", eventLimit: 1 } });
    const org = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const first = await createEvent(org, await eventForm());
    await expect(createEvent(org, await eventForm())).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(duplicateEvent(org, first.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await transitionEvent(org, first.id, "archive");
    await expect(createEvent(org, await eventForm())).resolves.toHaveProperty("id");
  });

  it("manual completion requests feedback and allows certificates before the scheduled start", async () => {
    const college = await makeCollege();
    const orgUser = await makeUser("EVENT_ORGANIZER", college.id);
    const org = asSession(orgUser);
    const event = await makeEvent({ collegeId: college.id, organizerId: orgUser.id, startsInH: 5, deadlineInH: 4 });
    const s = asSession(await makeUser("STUDENT", college.id));
    const reg = await registerForEvent(s, { eventId: event.id });
    const r = await prisma.registration.findUniqueOrThrow({ where: { id: reg.registrationId } });
    await checkIn(org, event.id, r.qrToken); // allowed within 24h of the start
    await expect(issueCertificates(org, { eventId: event.id, type: "PARTICIPATION" })).rejects.toMatchObject({ code: "CONFLICT" });
    await transitionEvent(org, event.id, "start");
    await transitionEvent(org, event.id, "complete");
    expect(await prisma.notification.count({ where: { userId: s.id, type: "FEEDBACK_REQUEST" } })).toBe(1);
    await expect(issueCertificates(org, { eventId: event.id, type: "PARTICIPATION" })).resolves.toMatchObject({ issued: 1 });
    await submitFeedback(s, { eventId: event.id, overall: 4, organization: 4, venue: 4, speakers: 4, experience: 4 });
  });
});
