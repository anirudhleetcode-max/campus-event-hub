import { expect, test } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

test.describe("authentication & guards", () => {
  test("anonymous users are sent to login from private areas", async ({ page }) => {
    for (const path of ["/dashboard", "/admin/dashboard", "/organizer/dashboard", "/my/registrations"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(ACCOUNTS.student);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("The email or password you entered is incorrect.").first()).toBeVisible();
  });

  test("suspended accounts cannot sign in", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill("suspended@northfield.demo");
    await page.getByLabel("Password", { exact: true }).fill("Demo@1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/suspended/i).first()).toBeVisible();
  });

  test("signing out from the account menu ends the session", async ({ page }) => {
    await login(page, ACCOUNTS.faculty);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    expect((await page.context().cookies()).some((c) => c.name === "ceh_session")).toBe(false);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("students cannot reach admin or organizer areas", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/organizer/events");
    await expect(page).not.toHaveURL(/\/organizer\/events$/);
  });

  test("organizers cannot reach admin pages; admin APIs reject them", async ({ page }) => {
    await login(page, ACCOUNTS.organizer);
    await expect(page).toHaveURL(/\/organizer\/dashboard/);
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users/);
    const res = await page.request.get("/api/exports/payments");
    expect(res.status()).toBe(403);
  });

  test("cross-origin POSTs to cookie-authenticated APIs are rejected", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    const res = await page.request.post("/api/payments/order", { data: { registrationId: "00000000-0000-4000-8000-000000000000" }, headers: { origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });

  test("webhook rejects unsigned payloads", async ({ request }) => {
    const res = await request.post("/api/webhooks/razorpay", { data: { event: "payment.captured", payload: {} } });
    expect([403, 503]).toContain(res.status());
  });

  test("cron endpoints require the secret", async ({ request }) => {
    expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  });
});
