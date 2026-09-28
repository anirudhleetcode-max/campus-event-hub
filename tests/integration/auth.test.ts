import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/server/auth/password";
import { makeCollege, prisma, resetDb } from "../helpers";

// Sessions are written to a cookie jar that only exists inside a request.
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  createSession: vi.fn(async () => undefined),
}));

const { login } = await import("@/server/services/auth");

describe("login rate limiting", () => {
  let email = "";
  beforeEach(async () => {
    await resetDb();
    const college = await makeCollege();
    email = `shared-demo-${Date.now()}@test.dev`;
    await prisma.user.create({ data: { email, name: "Shared Demo", role: "EVENT_ORGANIZER", collegeId: college.id, passwordHash: await hashPassword("Correct-Horse-1") } });
  });

  it("many successful sign-ins to one shared account never lock it", async () => {
    for (let i = 0; i < 25; i++) {
      await expect(login({ email, password: "Correct-Horse-1" }, { ip: `10.0.0.${i}` })).resolves.toMatchObject({ role: "EVENT_ORGANIZER" });
    }
  });

  it("still locks the account after 10 failed attempts, even for the right password", async () => {
    for (let i = 0; i < 10; i++) {
      await expect(login({ email, password: `wrong-${i}` }, { ip: "10.0.1.1" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(login({ email, password: "Correct-Horse-1" }, { ip: "10.0.1.2" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("parallel guesses cannot exceed the limit", async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => login({ email, password: `guess-${i}` }, { ip: "10.0.2.1" })));
    const codes = results.map((r) => (r.status === "rejected" ? (r.reason as { code: string }).code : "OK"));
    expect(codes.filter((c) => c === "UNAUTHENTICATED")).toHaveLength(10);
    expect(codes.filter((c) => c === "RATE_LIMITED")).toHaveLength(10);
  });
});
