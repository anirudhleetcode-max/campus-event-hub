import { chromium, expect, test, type Browser, type Page } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";
import { ACCOUNTS, db, login, logout, runStatusCron, uid } from "./helpers";
import { writeQrVideo } from "./fake-camera";

/**
 * The complete product lifecycle on one event, driven through the UI:
 *
 *   organizer creates (wizard) → submits → admin approves (goes live)
 *   → students discover & register → QR pass
 *   → event day (clock advanced, real status cron) → organizer scans the pass with the camera
 *   → event ends (cron) → feedback request → student feedback
 *   → organizer issues certificates (attendees only) → student downloads → public verification
 *   → organizer analytics, CSV export & PDF report → admin analytics
 *
 * Only the clock is simulated: event timestamps are moved into the past and the
 * real /api/cron/event-status endpoint advances the event's status.
 */
test.describe.configure({ mode: "serial" });

const H = 3_600_000;
const TITLE = `Lifecycle Workshop ${uid()}`;
const ATTENDEE = ACCOUNTS.student;
const NO_SHOW = "student5@northfield.demo";

/** datetime-local value in Asia/Kolkata (UTC+05:30, no DST). */
const localInput = (d: Date) => new Date(d.getTime() + 5.5 * H).toISOString().slice(0, 16);

async function eventId() {
  return (await db.event.findFirstOrThrow({ where: { title: TITLE } })).id;
}

async function registerFor(page: Page, email: string) {
  await login(page, email);
  await page.goto("/events");
  await page.getByRole("searchbox", { name: /search/i }).first().fill(TITLE);
  await expect(page).toHaveURL(/q=Lifecycle/);
  await page.getByRole("link", { name: TITLE }).first().click();
  await page.getByRole("link", { name: "Register Now" }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page).toHaveURL(/\/my\/registrations\/[0-9a-f-]{36}\?welcome=1/, { timeout: 20_000 });
}

test("1. organizer creates the event and submits it for approval", async ({ page }) => {
  await login(page, ACCOUNTS.organizer);
  await page.goto("/organizer/events/new");
  await page.getByLabel("Event name").fill(TITLE);
  await page.getByLabel("Short summary").fill("An end-to-end lifecycle workshop for students.");
  await page.getByLabel("Description").fill("A hands-on workshop that walks through the entire event lifecycle, from registration to certificates.");
  await page.getByLabel("Category").selectOption({ label: "Workshop" });
  await page.getByRole("button", { name: "Next" }).click();

  const start = new Date(Date.now() + 7 * 24 * H);
  start.setUTCMinutes(30, 0, 0); // 10:00 / 11:00 IST-style round time
  await page.getByLabel("Starts").fill(localInput(start));
  await page.getByLabel("Ends").fill(localInput(new Date(start.getTime() + 3 * H)));
  await page.getByLabel("Registration deadline").fill(localInput(new Date(start.getTime() - 24 * H)));
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Venue name").fill("Seminar Hall 3");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Maximum participants").fill("40");
  await page.getByLabel("Registration fee (₹)").fill("0");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click(); // media, rules → review
  await expect(page.getByText(TITLE).first()).toBeVisible();
  await page.getByRole("button", { name: /Save & submit for approval/ }).click();
  await expect(page).toHaveURL(/\/organizer\/events\/[0-9a-f-]{36}$/, { timeout: 20_000 }); // wizard navigates once saved

  await expect.poll(async () => (await db.event.findFirst({ where: { title: TITLE } }))?.status, { timeout: 20_000 }).toBe("PENDING_APPROVAL");
  // Not public until approved
  const slug = (await db.event.findFirstOrThrow({ where: { title: TITLE } })).slug;
  expect((await page.request.get(`/events/${slug}`)).status()).toBe(404);
});

test("2. college admin approves and the event goes live", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/events?status=PENDING_APPROVAL");
  await page.getByRole("link", { name: TITLE }).first().click();
  await page.getByRole("button", { name: "Approve & publish" }).first().click();
  await expect.poll(async () => (await db.event.findUniqueOrThrow({ where: { id: await eventId() } })).status, { timeout: 15_000 }).toBe("REGISTRATION_OPEN");
  // Audit entry and organizer notification are written later in the same request.
  const id = await eventId();
  await expect.poll(() => db.auditLog.count({ where: { entityId: id, action: "event.approve" } })).toBe(1);
  const organizer = await db.user.findUniqueOrThrow({ where: { email: ACCOUNTS.organizer } });
  await expect.poll(() => db.notification.count({ where: { userId: organizer.id, title: "Your event was approved" } })).toBeGreaterThan(0);
});

test("3. students discover the event, register and receive a QR pass", async ({ page }) => {
  await registerFor(page, ATTENDEE);
  await expect(page.getByText(/Event pass/i).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /QR/i }).first()).toBeVisible();
  await registerFor(page, NO_SHOW);

  const id = await eventId();
  expect(await db.registration.count({ where: { eventId: id, status: "CONFIRMED" } })).toBe(2);
  const student = await db.user.findUniqueOrThrow({ where: { email: ATTENDEE } });
  expect(await db.notification.count({ where: { userId: student.id, type: "REGISTRATION_CONFIRMED", title: { contains: TITLE } } })).toBe(1);
});

test("4. on event day the organizer scans the pass with the camera", async ({ request }) => {
  const id = await eventId();
  // Advance the clock: the event started 30 minutes ago.
  await db.event.update({ where: { id }, data: { registrationDeadline: new Date(Date.now() - 2 * H), startsAt: new Date(Date.now() - 0.5 * H), endsAt: new Date(Date.now() + 2 * H) } });
  await runStatusCron(request);
  expect((await db.event.findUniqueOrThrow({ where: { id } })).status).toBe("ONGOING");

  const reg = await db.registration.findFirstOrThrow({ where: { eventId: id, user: { email: ATTENDEE } } });
  const video = path.join(tmpdir(), `ceh-qr-${reg.id}.y4m`);
  writeQrVideo(`CEH1:${reg.qrToken}`, video);

  // A browser whose webcam shows the student's QR pass.
  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, permissions: ["camera"] });
    const page = await context.newPage();
    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/events/${id}/scan`);
    await page.getByRole("button", { name: "Start scanning" }).click();
    await expect(page.getByRole("heading", { name: "Checked in" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(reg.participantName).first()).toBeVisible();

    // The camera keeps seeing the same pass; the manual path proves duplicates are refused too.
    await page.getByLabel("Registration ID").fill(reg.code);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("heading", { name: "Already checked in" })).toBeVisible();

    const attendance = await db.attendance.findMany({ where: { registrationId: reg.id } });
    expect(attendance).toHaveLength(1);
    expect(attendance[0]!.method).toBe("QR");

    await page.goto(`/organizer/events/${id}/attendance`);
    await expect(page.getByText(reg.code).first()).toBeVisible();
    await context.close();
  } finally {
    await browser.close();
  }
});

test("5. the event ends and the attendee leaves feedback", async ({ page, request }) => {
  const id = await eventId();
  await db.event.update({ where: { id }, data: { endsAt: new Date(Date.now() - 60_000) } });
  const cron = await runStatusCron(request);
  expect(cron.completed).toBeGreaterThanOrEqual(1);
  expect((await db.event.findUniqueOrThrow({ where: { id } })).status).toBe("COMPLETED");

  const reg = await db.registration.findFirstOrThrow({ where: { eventId: id, user: { email: ATTENDEE } } });
  expect(await db.notification.count({ where: { userId: reg.userId, type: "FEEDBACK_REQUEST", title: { contains: TITLE } } })).toBe(1);

  await login(page, ATTENDEE);
  await page.goto(`/my/registrations/${reg.id}/feedback`);
  for (const key of ["overall", "organization", "venue", "speakers", "experience"]) await page.locator(`label[for="${key}-5"]`).click();
  await page.getByLabel("What did you like?").fill("Clear, hands-on and well organised.");
  await page.getByRole("button", { name: "Submit feedback" }).click();
  await expect.poll(() => db.feedback.count({ where: { registrationId: reg.id } }), { timeout: 15_000 }).toBe(1);

  // A second submission is refused.
  await page.goto(`/my/registrations/${reg.id}/feedback`);
  await expect(page.getByText(/already submitted feedback/i).first()).toBeVisible();
});

test("6. organizer issues certificates only to attendees; students download and anyone verifies", async ({ page }) => {
  const id = await eventId();
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${id}/feedback`);
  await expect(page.getByText("Clear, hands-on and well organised.").first()).toBeVisible();

  await page.goto(`/organizer/events/${id}/certificates`);
  await page.getByRole("button", { name: /Issue participation certificates/ }).click();
  await expect(page.getByText(/Issued 1 participation certificate/).first()).toBeVisible({ timeout: 15_000 });
  const certs = await db.certificate.findMany({ where: { eventId: id }, include: { user: true } });
  expect(certs.map((c) => c.user.email)).toEqual([ATTENDEE]); // the no-show gets none

  await logout(page);
  await login(page, ATTENDEE);
  await page.goto("/my/certificates");
  await expect(page.getByText(certs[0]!.code).first()).toBeVisible();
  const pdf = await page.request.get(`/api/certificates/${certs[0]!.code}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await logout(page);
  await page.goto(`/verify/${certs[0]!.code}`);
  await expect(page.getByText(/verified/i).first()).toBeVisible();
  await expect(page.getByText(TITLE).first()).toBeVisible();
});

test("7. organizer and admin analytics reflect the event", async ({ page }) => {
  const id = await eventId();
  await login(page, ACCOUNTS.organizer);
  await page.goto(`/organizer/events/${id}/analytics`);
  const stat = (label: string) => page.getByRole("group", { name: label, exact: true }).getByTestId("stat-value");
  await expect(stat("Registrations")).toHaveText("2");
  await expect(stat("Attendance")).toHaveText("1");
  await expect(stat("No-show rate")).toHaveText("50%");

  const csv = await page.request.get(`/api/exports/registrations?eventId=${id}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-disposition"]).toMatch(/attachment; filename=".+\.csv"/);
  const rows = (await csv.text()).trim().split(/\r?\n/);
  expect(rows).toHaveLength(3); // header + 2 registrations
  const report = await page.request.get(`/api/events/${id}/report`);
  expect(report.headers()["content-type"]).toContain("application/pdf");

  await logout(page);
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  await page.goto(`/organizer/events/${id}/analytics`);
  await expect(stat("Registrations")).toHaveText("2");
});
