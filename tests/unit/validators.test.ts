import { describe, expect, it } from "vitest";
import { eventInputSchema, signupSchema } from "@/lib/validators";
import { fromDateTimeLocal, formatMoney } from "@/lib/utils";
import { fillTemplate } from "@/server/services/certificates";

const valid = {
  title: "Test Event", summary: "A summary long enough", description: "A description that is definitely long enough.",
  categoryId: "3f1b1c3e-1111-4111-8111-111111111111", mode: "IN_PERSON", startsAt: "2030-01-10T10:00", endsAt: "2030-01-10T14:00",
  registrationDeadline: "2030-01-09T23:00", venueName: "Hall", capacity: "50", fee: "0",
};

describe("validators", () => {
  it("accepts a valid event", () => {
    const r = eventInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });
  it("rejects end before start and a deadline after the end", () => {
    const r = eventInputSchema.safeParse({ ...valid, endsAt: "2030-01-10T09:00", registrationDeadline: "2030-01-11T09:00" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("endsAt");
    expect(paths).toContain("registrationDeadline");
  });
  it("requires a meeting link for online events", () => {
    const r = eventInputSchema.safeParse({ ...valid, mode: "ONLINE", venueName: "" });
    expect(r.success).toBe(false);
  });
  it("rejects weak passwords and mismatches", () => {
    const r = signupSchema.safeParse({ name: "A B", email: "a@b.co", password: "password", confirmPassword: "passwordx", collegeId: valid.categoryId, acceptTerms: true });
    expect(r.success).toBe(false);
  });
  it("interprets datetime-local in IST", () => {
    expect(fromDateTimeLocal("2030-01-10T10:00")?.toISOString()).toBe("2030-01-10T04:30:00.000Z");
  });
  it("formats money from paise", () => {
    expect(formatMoney(0)).toBe("Free");
    expect(formatMoney(29900)).toBe("₹299");
  });
  it("fills certificate templates", () => {
    expect(fillTemplate("{{name}} won {{position}}", { name: "Ana", position: "1st" })).toBe("Ana won 1st");
  });
});
