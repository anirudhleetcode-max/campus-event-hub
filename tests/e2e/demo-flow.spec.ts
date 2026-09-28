import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, db, login, logout, uid } from "./helpers";

/**
 * The live demo script, performed entirely through the UI with NO database
 * writes from the test (the database is only read to assert outcomes).
 *
 * The event is scheduled a few hours ahead, which keeps check-in open
 * (passes can be scanned from 24h before the start). The organizer then marks
 * the event ongoing and completed from the event header, which unlocks
 * feedback and certificates without waiting for the real clock.
 */
test.describe.configure({ mode: "serial" });

const H = 3_600_000;
const TITLE = `Demo Day Workshop ${uid()}`;
const localInput = (d: Date) => new Date(d.getTime() + 5.5 * H).toISOString().slice(0, 16);

async function event() {
  return db.event.findFirstOrThrow({ where: { title: TITLE } });
}

/** Clicks a lifecycle action in the event header (primary button or the "More actions" menu). */
async function eventAction(page: Page, label: string, confirmLabel?: string) {
  const direct = page.getByRole("button", { name: label, exact: true });
  const menu = page.getByRole("button", { name: /More actions/ });
  await expect(direct.or(menu).first()).toBeVisible(); // wait for the header actions to render
  if (await direct.isVisible()) await direct.click();
  else {
    await menu.click();
    await page.getByRole("menuitem", { name: label }).click();
  }
  if (confirmLabel) await page.getByRole("dialog").getByRole("button", { name: confirmLabel }).click();
}

test("organizer creates and submits; admin approves", async ({ page }) => {
  await login(page, ACCOUNTS.organizer);
  await page.goto("/organizer/events/new");
  await page.getByLabel("Event name").fill(TITLE);
  await page.getByLabel("Short summary").fill("A short demo workshop run live during the presentation.");
  await page.getByLabel("Description").fill("Hands-on session used to demonstrate registration, QR check-in, feedback and certificates end to end.");
  await page.getByLabel("Category").selectOption({ label: "Workshop" });
  await page.getByRole("button", { name: "Next" }).click();
  const start = new Date(Math.ceil((Date.now() + 3 * H) / H) * H); // on the hour, ~3 hours from now
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
  // The wizard navigates to the event page once saved.
  await expect(page).toHaveURL(/\/organizer\/events\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  expect((await event()).status).toBe("PENDING_APPROVAL");

  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/events?status=PENDING_APPROVAL");
  await page.getByRole("link", { name: TITLE }).first().click();
  await eventAction(page, "Approve & publish");
  await expect.poll(async () => (await event()).status, { timeout: 15_000 }).toBe("REGISTRATION_OPEN");
});

test("student discovers and registers; organizer sees the registration", async ({ page }) => {
  await login(page, ACCOUNTS.student);
  await page.goto("/events");
  await page.getByRole("searchbox", { name: /search/i }).first().fill("Demo Day");
  await page.getByRole("link", { name: TITLE }).first().click();
  await page.getByRole("link", { name: "Register Now" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page).toHaveURL(/\/my\/registrations\/[0-9a-f-]{36}\?welcome=1/, { timeout: 20_000 });
  await expect(page.getByRole("img", { name: /QR/i }).first()).toBeVisible();

  const reg = await db.registration.findFirstOrThrow({ where: { eventId: (await event()).id } });
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${reg.eventId}/registrations`);
  await expect(page.getByText(reg.code).first()).toBeVisible();
});

test("organizer checks the student in; a duplicate scan is refused", async ({ page }) => {
  const ev = await event();
  const reg = await db.registration.findFirstOrThrow({ where: { eventId: ev.id } });
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${ev.id}/scan`);
  await page.getByLabel("Registration ID").fill(reg.code);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("heading", { name: "Checked in" })).toBeVisible();
  // The live update can show the result before the submission finishes; the field clears once it has.
  await expect(page.getByLabel("Registration ID")).toHaveValue("");
  await page.getByLabel("Registration ID").fill(reg.code);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByRole("heading", { name: "Already checked in" })).toBeVisible();
  expect(await db.attendance.count({ where: { eventId: ev.id } })).toBe(1);
});

test("organizer runs and completes the event from the header", async ({ page }) => {
  const ev = await event();
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${ev.id}`);
  await eventAction(page, "Mark as ongoing");
  await expect.poll(async () => (await event()).status).toBe("ONGOING");
  await page.reload();
  await eventAction(page, "Mark as completed", "Mark completed");
  await expect.poll(async () => (await event()).status).toBe("COMPLETED");
  const student = await db.user.findUniqueOrThrow({ where: { email: ACCOUNTS.student } });
  await expect.poll(() => db.notification.count({ where: { userId: student.id, type: "FEEDBACK_REQUEST", title: { contains: TITLE } } })).toBe(1);
});

test("student leaves feedback; organizer issues the certificate; student downloads and verifies", async ({ page }) => {
  const ev = await event();
  const reg = await db.registration.findFirstOrThrow({ where: { eventId: ev.id } });
  await login(page, ACCOUNTS.student);
  await page.goto(`/my/registrations/${reg.id}/feedback`);
  for (const key of ["overall", "organization", "venue", "speakers", "experience"]) await page.locator(`label[for="${key}-4"]`).click();
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect.poll(() => db.feedback.count({ where: { eventId: ev.id } }), { timeout: 15_000 }).toBe(1);

  await logout(page);
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${ev.id}/certificates`);
  await page.getByRole("button", { name: /Issue participation certificates/ }).click();
  await expect(page.getByText(/Issued 1 participation certificate/).first()).toBeVisible({ timeout: 15_000 });
  const cert = await db.certificate.findFirstOrThrow({ where: { eventId: ev.id } });

  await login(page, ACCOUNTS.student);
  await page.goto("/my/certificates");
  await expect(page.getByText(cert.code).first()).toBeVisible();
  expect((await page.request.get(`/api/certificates/${cert.code}/pdf`)).status()).toBe(200);
  await logout(page);
  await page.goto(`/verify/${cert.code}`);
  await expect(page.getByText(/verified/i).first()).toBeVisible();
});

test("organizer and admin see the results in analytics", async ({ page }) => {
  const ev = await event();
  const stat = (label: string) => page.getByRole("group", { name: label, exact: true }).getByTestId("stat-value");
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${ev.id}/analytics`);
  await expect(stat("Registrations")).toHaveText("1");
  await expect(stat("Attendance")).toHaveText("1");
  await expect(stat("Certificates")).toHaveText("1");
  await expect(stat("Feedback rating")).toHaveText("4.0 / 5");
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
});
