import { beforeEach, describe, expect, it } from "vitest";
import { registerForEvent, cancelOwnRegistration } from "@/server/services/registrations";
import { AppError } from "@/server/errors";
import { asSession, makeCollege, makeEvent, makeUser, prisma, resetDb } from "../helpers";

async function setup(capacity = 5, fee = 0) {
  const college = await makeCollege();
  const organizer = await makeUser("EVENT_ORGANIZER", college.id);
  const event = await makeEvent({ collegeId: college.id, organizerId: organizer.id, capacity, fee });
  return { college, organizer, event };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : `UNEXPECTED:${String(e)}`;
  }
};

describe("registration", () => {
  beforeEach(resetDb);

  it("confirms a free registration immediately with a QR token", async () => {
    const { college, event } = await setup();
    const s = await makeUser("STUDENT", college.id);
    const r = await registerForEvent(asSession(s), { eventId: event.id });
    expect(r.status).toBe("CONFIRMED");
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: r.registrationId } });
    expect(reg.qrToken.length).toBeGreaterThanOrEqual(24);
    expect(reg.code).toMatch(/^REG-[2-9A-Z]{8}$/);
    expect(await prisma.notification.count({ where: { userId: s.id, type: "REGISTRATION_CONFIRMED" } })).toBe(1);
  });

  it("prevents duplicate registration", async () => {
    const { college, event } = await setup();
    const s = await makeUser("STUDENT", college.id);
    await registerForEvent(asSession(s), { eventId: event.id });
    expect(await codeOf(registerForEvent(asSession(s), { eventId: event.id }))).toBe("ALREADY_REGISTERED");
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(1);
  });

  it("rejects registration after the deadline and for unpublished events", async () => {
    const college = await makeCollege();
    const org = await makeUser("EVENT_ORGANIZER", college.id);
    const s = await makeUser("STUDENT", college.id);
    const closed = await makeEvent({ collegeId: college.id, organizerId: org.id, deadlineInH: -1 });
    expect(await codeOf(registerForEvent(asSession(s), { eventId: closed.id }))).toBe("REGISTRATION_CLOSED");
    const draft = await makeEvent({ collegeId: college.id, organizerId: org.id, status: "DRAFT" });
    expect(await codeOf(registerForEvent(asSession(s), { eventId: draft.id }))).toBe("REGISTRATION_CLOSED");
  });

  it("rejects non-students", async () => {
    const { college, event } = await setup();
    const admin = await makeUser("COLLEGE_ADMIN", college.id);
    expect(await codeOf(registerForEvent(asSession(admin), { eventId: event.id }))).toBe("FORBIDDEN");
  });

  it("enforces capacity", async () => {
    const { college, event } = await setup(1);
    const a = await makeUser("STUDENT", college.id);
    const b = await makeUser("STUDENT", college.id);
    await registerForEvent(asSession(a), { eventId: event.id });
    expect(await codeOf(registerForEvent(asSession(b), { eventId: event.id }))).toBe("EVENT_FULL");
  });

  it("two students racing for the final seat: exactly one succeeds", async () => {
    const { college, event } = await setup(1);
    const a = await makeUser("STUDENT", college.id);
    const b = await makeUser("STUDENT", college.id);
    const results = await Promise.all([
      codeOf(registerForEvent(asSession(a), { eventId: event.id })),
      codeOf(registerForEvent(asSession(b), { eventId: event.id })),
    ]);
    expect(results.sort()).toEqual(["EVENT_FULL", "OK"]);
    expect(await prisma.registration.count({ where: { eventId: event.id, status: "CONFIRMED" } })).toBe(1);
  });

  it("20 concurrent students for 5 seats never overbook", async () => {
    const { college, event } = await setup(5);
    const students = await Promise.all(Array.from({ length: 20 }, () => makeUser("STUDENT", college.id)));
    const results = await Promise.all(students.map((s) => codeOf(registerForEvent(asSession(s), { eventId: event.id }))));
    expect(results.filter((r) => r === "OK")).toHaveLength(5);
    expect(results.filter((r) => r === "EVENT_FULL")).toHaveLength(15);
    expect(await prisma.registration.count({ where: { eventId: event.id } })).toBe(5);
  });

  it("paid registrations hold a seat that expires instead of consuming it forever", async () => {
    const { college, event } = await setup(1, 10000);
    const a = await makeUser("STUDENT", college.id);
    const b = await makeUser("STUDENT", college.id);
    const r = await registerForEvent(asSession(a), { eventId: event.id });
    expect(r.status).toBe("PENDING_PAYMENT");
    expect(r.holdExpiresAt).not.toBeNull();
    // Seat is held → B cannot register
    expect(await codeOf(registerForEvent(asSession(b), { eventId: event.id }))).toBe("EVENT_FULL");
    // Hold expires (payment abandoned) → seat is released automatically
    await prisma.registration.update({ where: { id: r.registrationId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    expect(await codeOf(registerForEvent(asSession(b), { eventId: event.id }))).toBe("OK");
  });

  it("validates required fields and custom questions server-side", async () => {
    const { college, event } = await setup();
    await prisma.event.update({ where: { id: event.id }, data: { requiredFields: ["phone"] } });
    const q = await prisma.eventQuestion.create({ data: { eventId: event.id, label: "Track", type: "SELECT", options: ["A", "B"], required: true } });
    const s = await makeUser("STUDENT", college.id);
    try {
      await registerForEvent(asSession(s), { eventId: event.id, answers: { [q.id]: "C" } });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as AppError).code).toBe("VALIDATION");
      expect((e as AppError).fieldErrors).toMatchObject({ phone: expect.any(String), [`answers.${q.id}`]: expect.any(String) });
    }
    const ok = await registerForEvent(asSession(s), { eventId: event.id, phone: "+91 98765 43210", answers: { [q.id]: "B" } });
    expect(ok.status).toBe("CONFIRMED");
    expect(await prisma.registrationAnswer.count({ where: { registrationId: ok.registrationId } })).toBe(1);
  });

  it("allows cancelling and re-registering", async () => {
    const { college, event } = await setup(1);
    const s = await makeUser("STUDENT", college.id);
    const r = await registerForEvent(asSession(s), { eventId: event.id });
    await cancelOwnRegistration(asSession(s), r.registrationId);
    const again = await registerForEvent(asSession(s), { eventId: event.id });
    expect(again.registrationId).toBe(r.registrationId);
    expect(again.status).toBe("CONFIRMED");
  });
});
