import { describe, expect, it } from "vitest";
import { allowedTransitions, canApplyAction, canTransition, isRegistrationOpen, registrationCta, timeDrivenStatus } from "@/lib/event-status";

const H = 3_600_000;
const now = new Date("2026-10-01T10:00:00Z");
const base = {
  status: "REGISTRATION_OPEN" as const,
  registrationOpensAt: null,
  registrationDeadline: new Date(now.getTime() + 24 * H),
  startsAt: new Date(now.getTime() + 48 * H),
  endsAt: new Date(now.getTime() + 52 * H),
  feeAmount: 0,
  capacity: 10,
};

describe("event state machine", () => {
  it("allows valid transitions", () => {
    expect(canApplyAction("DRAFT", "submit")).toBe(true);
    expect(canApplyAction("PENDING_APPROVAL", "approve")).toBe(true);
    expect(canApplyAction("REGISTRATION_OPEN", "closeRegistration")).toBe(true);
    expect(canApplyAction("ONGOING", "complete")).toBe(true);
    expect(canApplyAction("COMPLETED", "archive")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canApplyAction("DRAFT", "complete")).toBe(false);
    expect(canApplyAction("COMPLETED", "openRegistration")).toBe(false);
    expect(canApplyAction("CANCELLED", "publish")).toBe(false);
    expect(canApplyAction("ARCHIVED", "unpublish")).toBe(false);
    expect(canTransition("ARCHIVED", "DRAFT")).toBe(false);
    expect(allowedTransitions("ARCHIVED")).toEqual([]);
  });

  it("time drives status forward but never backwards", () => {
    expect(timeDrivenStatus({ ...base, status: "PUBLISHED" }, now)).toBe("REGISTRATION_OPEN");
    expect(timeDrivenStatus({ ...base, status: "PUBLISHED", registrationOpensAt: new Date(now.getTime() + H) }, now)).toBe("PUBLISHED");
    expect(timeDrivenStatus(base, new Date(base.registrationDeadline.getTime() + 1))).toBe("REGISTRATION_CLOSED");
    expect(timeDrivenStatus(base, new Date(base.startsAt.getTime() + 1))).toBe("ONGOING");
    expect(timeDrivenStatus(base, new Date(base.endsAt.getTime() + 1))).toBe("COMPLETED");
    expect(timeDrivenStatus({ ...base, status: "REGISTRATION_CLOSED" }, now)).toBe("REGISTRATION_CLOSED");
    expect(timeDrivenStatus({ ...base, status: "DRAFT" }, new Date(base.endsAt.getTime() + 1))).toBe("DRAFT");
  });
});

describe("registration window & CTA", () => {
  it("is open only within the window", () => {
    expect(isRegistrationOpen(base, now)).toBe(true);
    expect(isRegistrationOpen(base, new Date(base.registrationDeadline.getTime()))).toBe(false);
    expect(isRegistrationOpen({ ...base, status: "REGISTRATION_CLOSED" }, now)).toBe(false);
    expect(isRegistrationOpen({ ...base, status: "DRAFT" }, now)).toBe(false);
  });

  it("computes the right call to action", () => {
    expect(registrationCta(base, 0, null, now).label).toBe("Register Now");
    expect(registrationCta({ ...base, feeAmount: 100 }, 0, null, now).label).toBe("Register & Pay");
    expect(registrationCta(base, 10, null, now).label).toBe("Event Full");
    expect(registrationCta(base, 0, { status: "CONFIRMED", holdExpiresAt: null }, now).label).toBe("View Registration");
    expect(registrationCta(base, 0, null, new Date(base.registrationDeadline.getTime() + 1)).label).toBe("Registration Closed");
    expect(registrationCta({ ...base, status: "CANCELLED" }, 0, null, now).state).toBe("cancelled");
    expect(registrationCta(base, 0, { status: "PENDING_PAYMENT", holdExpiresAt: new Date(now.getTime() + 60_000) }, now).state).toBe("pending_payment");
  });
});
