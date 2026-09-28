import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke test for a DEPLOYED instance (see playwright.smoke.config.ts):
 *
 *   SMOKE_BASE_URL=https://your-app.onrender.com npm run test:smoke
 *
 * Needs only the public URL and the seeded demo accounts; it never touches the
 * database directly. The "demo flow" block performs the full hackathon demo
 * through the UI on a uniquely named event ("Smoke Test Workshop <id>"), so it
 * does add that one event (plus its registration, feedback and certificate)
 * to the deployment. Set SMOKE_READ_ONLY=1 to skip it.
 */

const PASSWORD = "Demo@1234";
const ACCOUNTS = {
  student: "student@northfield.demo",
  organizer: "organizer@northfield.demo",
  admin: "admin@northfield.demo",
  volunteer: "student5@northfield.demo",
} as const;

const H = 3_600_000;
const BASE = process.env.SMOKE_BASE_URL ?? "";
const localInput = (d: Date) => new Date(d.getTime() + 5.5 * H).toISOString().slice(0, 16); // Asia/Kolkata

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 30_000 });
}

/** Clicks a lifecycle action in the event header (primary button or the "More actions" menu). */
async function eventAction(page: Page, label: string, confirmLabel?: string) {
  const direct = page.getByRole("button", { name: label, exact: true });
  const menu = page.getByRole("button", { name: /More actions/ });
  await expect(direct.or(menu).first()).toBeVisible();
  if (await direct.isVisible()) await direct.click();
  else {
    await menu.click();
    await page.getByRole("menuitem", { name: label }).click();
  }
  if (confirmLabel) await page.getByRole("dialog").getByRole("button", { name: confirmLabel }).click();
}

test.describe("deployment basics", () => {
  test("homepage, HTTPS, security headers and health", async ({ page, request }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const headers = res!.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    if (BASE.startsWith("https://")) {
      expect(page.url()).toMatch(/^https:\/\//);
      expect(headers["strict-transport-security"]).toContain("max-age=");
    }
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", database: "up" });
  });

  test("cron endpoints reject calls without the secret", async ({ request }) => {
    for (const job of ["event-status", "reminders", "cleanup"]) {
      expect((await request.get(`/api/cron/${job}`)).status(), job).toBe(401);
      expect((await request.get(`/api/cron/${job}`, { headers: { authorization: "Bearer wrong-secret" } })).status(), job).toBe(401);
    }
  });

  test("unsigned payment webhooks are rejected", async ({ request }) => {
    const res = await request.post("/api/webhooks/razorpay", { data: "{}", headers: { "content-type": "application/json" } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("private areas require sign-in", async ({ page }) => {
    for (const path of ["/dashboard", "/admin/dashboard", "/organizer/dashboard", "/my/registrations"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login\?next=/);
    }
  });

  test("each demo role signs in and lands on its home; sign-out works", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    await expect(page).toHaveURL(/\/dashboard/);
    await login(page, ACCOUNTS.organizer);
    await expect(page).toHaveURL(/\/organizer\/dashboard/);
    await login(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("role boundaries hold", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users/);
    await page.goto("/organizer/events");
    await expect(page).not.toHaveURL(/\/organizer\/events$/);
    await login(page, ACCOUNTS.organizer);
    await page.goto("/admin/users");
    await expect(page).not.toHaveURL(/\/admin\/users/);
    expect((await page.request.get("/api/exports/payments")).status()).toBe(403);
    await login(page, ACCOUNTS.volunteer);
    await expect(page.getByRole("link", { name: "Open scanner" }).first()).toBeVisible();
  });

  test("event discovery and a seeded certificate verify publicly", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("link", { name: /Robotics Expo/ }).first()).toBeVisible();
    await login(page, ACCOUNTS.student);
    await page.goto("/my/certificates");
    await expect(page.getByText(/CEH-\d{4}-[A-Z0-9]{8}/).first()).toBeVisible(); // the list streams in after a loading state
    const code = (await page.locator("body").innerText()).match(/CEH-\d{4}-[A-Z0-9]{8}/)?.[0];
    expect(code, "seeded certificate code").toBeTruthy();
    await page.context().clearCookies();
    await page.goto(`/verify/${code}`);
    await expect(page.getByText(/verified/i).first()).toBeVisible();
  });
});

test.describe("hackathon demo flow (writes one uniquely named event)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.SMOKE_READ_ONLY === "1", "SMOKE_READ_ONLY=1");

  const TITLE = `Smoke Test Workshop ${Math.random().toString(36).slice(2, 8)}`;
  let eventId = "";
  let registrationId = "";
  let registrationCode = "";

  test("organizer creates and submits; admin approves", async ({ page }) => {
    await login(page, ACCOUNTS.organizer);
    await page.goto("/organizer/events/new");
    await page.getByLabel("Event name").fill(TITLE);
    await page.getByLabel("Short summary").fill("Automated smoke test of the deployed demo flow.");
    await page.getByLabel("Description").fill("Created by the deployment smoke test to verify registration, check-in, feedback and certificates.");
    await page.getByLabel("Category").selectOption({ label: "Workshop" });
    await page.getByRole("button", { name: "Next" }).click();
    const start = new Date(Math.ceil((Date.now() + 3 * H) / H) * H);
    await page.getByLabel("Starts").fill(localInput(start));
    await page.getByLabel("Ends").fill(localInput(new Date(start.getTime() + 2 * H)));
    await page.getByLabel("Registration deadline").fill(localInput(new Date(start.getTime() - H)));
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Venue name").fill("Seminar Hall 1");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Maximum participants").fill("30");
    await page.getByLabel("Registration fee (₹)").fill("0");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: /Save & submit for approval/ }).click();
    await expect(page).toHaveURL(/\/organizer\/events\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    eventId = page.url().split("/").pop()!;
    await expect(page.getByText("Pending approval").first()).toBeVisible();

    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/events?status=PENDING_APPROVAL");
    await page.getByRole("link", { name: TITLE }).first().click();
    await eventAction(page, "Approve & publish");
    await expect(page.getByText("Registration open").first()).toBeVisible({ timeout: 20_000 });
  });

  test("student discovers and registers; organizer sees it", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    await page.goto("/events");
    await page.getByRole("searchbox", { name: /search/i }).first().fill("Smoke Test Workshop");
    await page.getByRole("link", { name: TITLE }).first().click();
    await page.getByRole("link", { name: "Register Now" }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: "Confirm registration" }).click();
    await expect(page).toHaveURL(/\/my\/registrations\/[0-9a-f-]{36}\?welcome=1/, { timeout: 30_000 });
    registrationId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByRole("img", { name: /QR/i }).first()).toBeVisible();
    await expect(page.getByText(/REG-[A-Z0-9]{8}/).first()).toBeVisible();
    registrationCode = (await page.locator("body").innerText()).match(/REG-[A-Z0-9]{8}/)![0];

    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/events/${eventId}/registrations`);
    await expect(page.getByText(registrationCode).first()).toBeVisible();
  });

  test("check-in works and a duplicate is refused", async ({ page }) => {
    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/events/${eventId}/scan`);
    await page.getByLabel("Registration ID").fill(registrationCode);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("heading", { name: "Checked in" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Registration ID")).toHaveValue("");
    await page.getByLabel("Registration ID").fill(registrationCode);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("heading", { name: "Already checked in" })).toBeVisible({ timeout: 20_000 });
  });

  test("organizer runs and completes the event", async ({ page }) => {
    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/events/${eventId}`);
    await eventAction(page, "Mark as ongoing");
    await expect(page.getByText("Ongoing").first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await eventAction(page, "Mark as completed", "Mark completed");
    await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 20_000 });
  });

  test("feedback, certificate, download and public verification", async ({ page }) => {
    await login(page, ACCOUNTS.student);
    await page.goto(`/my/registrations/${registrationId}/feedback`);
    for (const key of ["overall", "organization", "venue", "speakers", "experience"]) await page.locator(`label[for="${key}-4"]`).click();
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page).toHaveURL(new RegExp(`/my/registrations/${registrationId}$`), { timeout: 20_000 });

    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/events/${eventId}/certificates`);
    await page.getByRole("button", { name: /Issue participation certificates/ }).click();
    await expect(page.getByText(/Issued 1 participation certificate/).first()).toBeVisible({ timeout: 20_000 });

    await login(page, ACCOUNTS.student);
    await page.goto("/my/certificates");
    const card = page.locator("li, tr, article, [data-slot=card]").filter({ hasText: TITLE }).first();
    await expect(card).toContainText(/CEH-\d{4}-[A-Z0-9]{8}/);
    const code = (await card.innerText()).match(/CEH-\d{4}-[A-Z0-9]{8}/)![0];
    const pdf = await page.request.get(`/api/certificates/${code}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    await page.context().clearCookies();
    await page.goto(`/verify/${code}`);
    await expect(page.getByText(/verified/i).first()).toBeVisible();
    await expect(page.getByText(TITLE).first()).toBeVisible();
  });

  test("analytics reflect the demo", async ({ page }) => {
    const stat = (label: string) => page.getByRole("group", { name: label, exact: true }).getByTestId("stat-value");
    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/events/${eventId}/analytics`);
    await expect(stat("Registrations")).toHaveText("1");
    await expect(stat("Attendance")).toHaveText("1");
    await expect(stat("Certificates")).toHaveText("1");
    await expect(stat("Feedback rating")).toHaveText("4.0 / 5");
    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  });
});
