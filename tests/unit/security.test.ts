import { describe, expect, it } from "vitest";
import { signForTests, verifyCheckoutSignature, verifyWebhookSignature } from "@/server/payments/signature";
import { computeEventAccess, assignableRoles, can } from "@/server/auth/permissions";
import { toCsv } from "@/server/csv";
import { redact } from "@/server/logger";
import { parseQrPayload } from "@/server/services/attendance";
import { sniffImage } from "@/server/storage";

describe("Razorpay signatures", () => {
  const secret = "s3cret";
  it("verifies a valid checkout signature", () => {
    const sig = signForTests.checkout("order_1", "pay_1", secret);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig, secret })).toBe(true);
  });
  it("rejects tampered checkout data", () => {
    const sig = signForTests.checkout("order_1", "pay_1", secret);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature: sig, secret })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig, secret: "other" })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "not-hex", secret })).toBe(false);
    expect(verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig, secret: "" })).toBe(false);
  });
  it("verifies webhook signatures over the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = signForTests.webhook(body, secret);
    expect(verifyWebhookSignature({ rawBody: body, signature: sig, secret })).toBe(true);
    expect(verifyWebhookSignature({ rawBody: body + " ", signature: sig, secret })).toBe(false);
    expect(verifyWebhookSignature({ rawBody: body, signature: null, secret })).toBe(false);
  });
});

describe("RBAC", () => {
  const event = { collegeId: "c1", organizerId: "org1" };
  it("grants full access to super admins and same-college admins only", () => {
    expect(computeEventAccess({ id: "x", role: "SUPER_ADMIN", collegeId: null }, event, null).canManage).toBe(true);
    expect(computeEventAccess({ id: "x", role: "COLLEGE_ADMIN", collegeId: "c1" }, event, null).canApprove).toBe(true);
    expect(computeEventAccess({ id: "x", role: "COLLEGE_ADMIN", collegeId: "c2" }, event, null).canView).toBe(false);
  });
  it("limits organizers to their own events", () => {
    expect(computeEventAccess({ id: "org1", role: "EVENT_ORGANIZER", collegeId: "c1" }, event, null).canManage).toBe(true);
    expect(computeEventAccess({ id: "org1", role: "EVENT_ORGANIZER", collegeId: "c1" }, event, null).canApprove).toBe(false);
    expect(computeEventAccess({ id: "org2", role: "EVENT_ORGANIZER", collegeId: "c1" }, event, null).canView).toBe(false);
    expect(computeEventAccess({ id: "org2", role: "EVENT_ORGANIZER", collegeId: "c1" }, event, "CO_ORGANIZER").canManage).toBe(true);
  });
  it("gives faculty read-only and volunteers scan-only access", () => {
    const f = computeEventAccess({ id: "f", role: "FACULTY_COORDINATOR", collegeId: "c1" }, event, "FACULTY_COORDINATOR");
    expect(f).toMatchObject({ canView: true, canManage: false });
    const v = computeEventAccess({ id: "s", role: "STUDENT", collegeId: "c1" }, event, "VOLUNTEER", true);
    expect(v).toMatchObject({ canView: false, canManage: false, canScan: true });
    expect(computeEventAccess({ id: "s", role: "STUDENT", collegeId: "c1" }, event, null)).toMatchObject({ canView: false, canScan: false });
  });
  it("restricts role assignment and coarse permissions", () => {
    expect(assignableRoles({ role: "COLLEGE_ADMIN" })).not.toContain("SUPER_ADMIN");
    expect(assignableRoles({ role: "COLLEGE_ADMIN" })).not.toContain("COLLEGE_ADMIN");
    expect(assignableRoles({ role: "EVENT_ORGANIZER" })).toEqual([]);
    expect(can({ role: "STUDENT" }, "events:create")).toBe(false);
    expect(can({ role: "STUDENT" }, "events:register")).toBe(true);
    expect(can({ role: "EVENT_ORGANIZER" }, "audit:view")).toBe(false);
  });
});

describe("hardening helpers", () => {
  it("escapes CSV and neutralises formulas", () => {
    const csv = toCsv(["a", "b"], [["=SUM(A1)", 'He said "hi", ok']]);
    expect(csv).toContain(`'=SUM(A1)`);
    expect(csv).toContain(`"He said ""hi"", ok"`);
  });
  it("redacts secrets from logs", () => {
    expect(redact({ password: "x", nested: { apiKey: "k", ok: 1 } })).toEqual({ password: "[REDACTED]", nested: { apiKey: "[REDACTED]", ok: 1 } });
  });
  it("parses QR payloads strictly", () => {
    expect(parseQrPayload("CEH1:abcdefghijklmnopqrstuvwx")).toBe("abcdefghijklmnopqrstuvwx");
    expect(parseQrPayload("CEH1:<script>")).toBeNull();
    expect(parseQrPayload("short")).toBeNull();
  });
  it("detects image types by magic bytes, not extension", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe("image/png");
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
  });
});
