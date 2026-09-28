import { expect, test } from "@playwright/test";
import { ACCOUNTS, db, expectNoHorizontalOverflow, login, uid } from "./helpers";

test.describe("student journey", () => {
  test("sign up, discover, register for a free event and get a QR pass", async ({ page }) => {
    const email = `e2e-${uid()}@northfield.demo`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Esha Test");
    await page.getByLabel("College email").fill(email);
    await page.getByRole("combobox", { name: "College", exact: true }).selectOption({ label: "Northfield Institute of Technology" });
    await page.locator("#password").fill("Passw0rd!x");
    await page.locator("#confirmPassword").fill("Passw0rd!x");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    // Discovery with server-side search
    await page.goto("/events");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("searchbox").first().fill("LLMs");
    await expect(page).toHaveURL(/q=LLMs/, { timeout: 10_000 });
    await page.getByRole("link", { name: /Building with LLMs/ }).first().click();
    await expect(page.getByRole("heading", { name: /Building with LLMs/ }).first()).toBeVisible();

    // Register
    await page.getByRole("link", { name: "Register Now" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await page.getByRole("button", { name: "Confirm registration" }).click();
    // Student ID is required for this event and missing from the new profile → inline error
    await expect(page.getByText("Student ID is required").first()).toBeVisible();
    await page.getByLabel(/Student ID/).fill("E2E-001");
    await page.getByRole("button", { name: "Confirm registration" }).click();
    await expect(page).toHaveURL(/\/my\/registrations\/[0-9a-f-]{36}/, { timeout: 20_000 });

    // QR pass with registration code, no personal data in QR
    const reg = await db.registration.findFirstOrThrow({ where: { participantEmail: email }, orderBy: { createdAt: "desc" } });
    expect(reg.status).toBe("CONFIRMED");
    await expect(page.getByText(reg.code).first()).toBeVisible();
    await expect(page.getByRole("img", { name: /QR/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Duplicate registration is prevented
    const slug = (await db.event.findUniqueOrThrow({ where: { id: reg.eventId } })).slug;
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("link", { name: "View Registration" }).filter({ visible: true }).first()).toBeVisible();

    // Notification created and visible
    await page.goto("/notifications");
    await expect(page.getByText(/You're registered for Building with LLMs/).first()).toBeVisible();
  });

  test("paid events never confirm without a real gateway payment", async ({ page }) => {
    // The E2E environment has no Razorpay keys: the app must refuse clearly rather than fake a payment
    // or take a seat hold nobody can pay for.
    const email = `e2e-paid-${uid()}@northfield.demo`;
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Paid Tester");
    await page.getByLabel("College email").fill(email);
    await page.getByRole("combobox", { name: "College", exact: true }).selectOption({ label: "Northfield Institute of Technology" });
    await page.locator("#password").fill("Passw0rd!x");
    await page.locator("#confirmPassword").fill("Passw0rd!x");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

    const event = await db.event.findFirstOrThrow({ where: { title: { startsWith: "Circuit Design" } } });
    await page.goto(`/events/${event.slug}/register`);
    await expect(page.getByText("Online payment is unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue to pay/ })).toHaveCount(0);

    // Even a direct server call cannot create a hold or a payment.
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(await db.registration.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.payment.count({ where: { userId: user.id } })).toBe(0);
    const order = await page.request.post("/api/payments/order", { data: { registrationId: "00000000-0000-4000-8000-000000000000" }, headers: { origin: new URL(page.url()).origin } });
    expect(order.status()).toBe(404);
  });

  test("demo student sees dashboard, pass, receipt, certificates and profile", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/my/registrations");
    await expect(page.getByText("HackNorth 2026").first()).toBeVisible();

    await page.goto("/my/payments");
    const payment = await db.payment.findFirstOrThrow({ where: { user: { email: ACCOUNTS.student }, status: "CAPTURED" } });
    await page.goto(`/my/payments/${payment.id}`);
    await expect(page.getByText(payment.receipt).first()).toBeVisible();
    await expect(page.getByText(payment.razorpayPaymentId!).first()).toBeVisible();
    await expect(page.getByText(/demo/i).first()).toBeVisible();

    await page.goto("/my/certificates");
    const cert = await db.certificate.findFirstOrThrow({ where: { user: { email: ACCOUNTS.student } } });
    await expect(page.getByText(cert.code).first()).toBeVisible();
    const pdf = await page.request.get(`/api/certificates/${cert.code}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto("/profile");
    await expect(page.getByLabel("Full name").or(page.getByLabel("Name")).first()).toBeVisible();
  });

  test("students cannot open other students' registrations, payments or certificates", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    const other = await db.registration.findFirstOrThrow({ where: { user: { email: { not: ACCOUNTS.student } }, status: "CONFIRMED" } });
    const res = await page.goto(`/my/registrations/${other.id}`);
    expect(res?.status()).toBe(404);
    const otherPay = await db.payment.findFirstOrThrow({ where: { user: { email: { not: ACCOUNTS.student } } } });
    expect((await page.goto(`/my/payments/${otherPay.id}`))?.status()).toBe(404);
    const otherCert = await db.certificate.findFirstOrThrow({ where: { user: { email: { not: ACCOUNTS.student } } } });
    expect((await page.request.get(`/api/certificates/${otherCert.code}/pdf`)).status()).toBe(403);
  });

  test("public certificate verification shows only public details", async ({ page }) => {
    const cert = await db.certificate.findFirstOrThrow({ where: { status: "ISSUED" }, include: { user: true } });
    await page.goto(`/verify/${cert.code}`);
    await expect(page.getByText(cert.recipientName).first()).toBeVisible();
    await expect(page.getByText(/verified/i).first()).toBeVisible();
    await expect(page.getByText(cert.user.email)).toHaveCount(0);
    await page.goto("/verify/CEH-2026-ZZZZZZZZ");
    await expect(page.getByText(/no certificate found/i).first()).toBeVisible();
  });
});
