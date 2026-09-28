import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, db, expectNoHorizontalOverflow, login, logout, uid } from "./helpers";

const H = 3_600_000;
function localInput(d: Date) {
  // datetime-local value in Asia/Kolkata (UTC+05:30, no DST)
  return new Date(d.getTime() + 5.5 * H).toISOString().slice(0, 16);
}

async function registerDemoStudentFor(page: Page, slug: string) {
  await login(page, ACCOUNTS.student);
  await page.goto(`/events/${slug}/register`);
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page).toHaveURL(/\/my\/registrations\/[0-9a-f-]{36}/, { timeout: 20_000 });
}

test.describe("organizer: attendance → feedback → certificates", () => {
  test("QR check-in, duplicate protection, feedback and certificate verification", async ({ page }) => {
    const event = await db.event.findFirstOrThrow({ where: { title: { startsWith: "Poetry Slam" } } });
    await registerDemoStudentFor(page, event.slug);
    const student = await db.user.findUniqueOrThrow({ where: { email: ACCOUNTS.student } });
    const reg = await db.registration.findUniqueOrThrow({ where: { eventId_userId: { eventId: event.id, userId: student.id } } });

    // Simulate the event day arriving (time passing), then scan at the door.
    await db.event.update({ where: { id: event.id }, data: { registrationDeadline: new Date(Date.now() - 2 * H), startsAt: new Date(Date.now() - H), endsAt: new Date(Date.now() + 2 * H), status: "ONGOING" } });
    await logout(page);
    await login(page, ACCOUNTS.riversideOrganizer);
    await page.goto(`/organizer/events/${event.id}/scan`);
    await page.getByLabel("Registration ID").fill(reg.code);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByText(reg.participantName).first()).toBeVisible();
    await expect(page.getByText(/checked in/i).first()).toBeVisible();
    await page.getByLabel("Registration ID").fill(reg.code);
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("heading", { name: "Already checked in" }).first()).toBeVisible();
    expect(await db.attendance.count({ where: { registrationId: reg.id } })).toBe(1);

    // Attendance dashboard
    await page.goto(`/organizer/events/${event.id}/attendance`);
    await expect(page.getByText(reg.code).first()).toBeVisible();

    // Event ends → student leaves feedback
    await db.event.update({ where: { id: event.id }, data: { endsAt: new Date(Date.now() - 60_000), status: "COMPLETED" } });
    await logout(page);
    await login(page, ACCOUNTS.student);
    await page.goto(`/my/registrations/${reg.id}/feedback`);
    for (const key of ["overall", "organization", "venue", "speakers", "experience"]) await page.locator(`label[for="${key}-5"]`).click();
    await page.getByLabel("What did you like?").fill("Wonderful evening of poetry.");
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page).toHaveURL(new RegExp(`/my/registrations/${reg.id}(\\?|$)`), { timeout: 15_000 });
    expect(await db.feedback.count({ where: { registrationId: reg.id } })).toBe(1);

    // Organizer issues participation certificates to attendees
    await logout(page);
    await login(page, ACCOUNTS.riversideOrganizer);
    await page.goto(`/organizer/events/${event.id}/feedback`);
    await expect(page.getByText("Wonderful evening of poetry.").first()).toBeVisible();
    await page.goto(`/organizer/events/${event.id}/certificates`);
    await page.getByRole("button", { name: /Issue participation certificates/ }).click();
    await expect(page.getByText(/Issued \d+ participation certificate/).first()).toBeVisible({ timeout: 15_000 });
    const cert = await db.certificate.findFirstOrThrow({ where: { eventId: event.id, userId: student.id } });

    // Analytics & PDF report
    await page.goto(`/organizer/events/${event.id}/analytics`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const report = await page.request.get(`/api/events/${event.id}/report`);
    expect(report.status()).toBe(200);
    expect(report.headers()["content-type"]).toContain("application/pdf");

    // Student downloads and anyone verifies
    await logout(page);
    await login(page, ACCOUNTS.student);
    await page.goto("/my/certificates");
    await expect(page.getByText(cert.code).first()).toBeVisible();
    expect((await page.request.get(`/api/certificates/${cert.code}/pdf`)).status()).toBe(200);
    await logout(page);
    await page.goto(`/verify/${cert.code}`);
    await expect(page.getByText(/verified/i).first()).toBeVisible();
  });

  test("forged QR payloads are rejected by the scan API", async ({ page }) => {
    await login(page, ACCOUNTS.organizer);
    const event = await db.event.findFirstOrThrow({ where: { title: { startsWith: "Robotics Expo" } } });
    const res = await page.request.post("/api/attendance/scan", {
      data: { eventId: event.id, payload: "CEH1:forgedforgedforgedforgedforged" },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe("INVALID_QR");
  });

  test("faculty coordinator is read-only; other colleges' organizers are blocked", async ({ page }) => {
    const hack = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
    await login(page, ACCOUNTS.faculty);
    await page.goto(`/organizer/events/${hack.id}/registrations`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await logout(page);
    await login(page, ACCOUNTS.riversideOrganizer);
    await page.goto(`/organizer/events/${hack.id}/registrations`);
    await expect(page.getByText(/permission/i).first()).toBeVisible();
  });
});

test.describe("organizer: create → submit → admin approves", () => {
  test("wizard creates an event that goes live after approval", async ({ page }) => {
    const title = `E2E Workshop ${uid()}`;
    await login(page, ACCOUNTS.organizer);
    await page.goto("/organizer/events/new");
    await expectNoHorizontalOverflow(page);
    await page.getByLabel("Event name").fill(title);
    await page.getByLabel("Short summary").fill("An end-to-end tested workshop for students.");
    await page.getByLabel("Description").fill("A hands-on workshop created by the automated end-to-end test suite to verify the event wizard.");
    await page.getByLabel("Category").selectOption({ label: "Workshop" });
    await page.getByRole("button", { name: "Next" }).click();

    const start = new Date(Date.now() + 10 * 24 * H);
    start.setUTCMinutes(0, 0, 0);
    await page.getByLabel("Starts").fill(localInput(start));
    await page.getByLabel("Ends").fill(localInput(new Date(start.getTime() + 3 * H)));
    await page.getByLabel("Registration deadline").fill(localInput(new Date(start.getTime() - 24 * H)));
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByLabel("Venue name").fill("Seminar Hall 3");
    await page.getByLabel("City").fill("Bengaluru");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByLabel("Maximum participants").fill("40");
    await page.getByLabel("Registration fee (₹)").fill("0");
    await page.getByRole("button", { name: "Next" }).click(); // media
    await page.getByRole("button", { name: "Next" }).click(); // rules
    await page.getByRole("button", { name: "Next" }).click(); // review
    await expect(page.getByText(title).first()).toBeVisible();
    await page.getByRole("button", { name: /Save & submit for approval/ }).click();
    await expect.poll(async () => (await db.event.findFirst({ where: { title } }))?.status, { timeout: 20_000 }).toBe("PENDING_APPROVAL");
    const created = await db.event.findFirstOrThrow({ where: { title } });

    await logout(page);
    await login(page, ACCOUNTS.admin);
    await page.goto(`/organizer/events/${created.id}`);
    await page.getByRole("button", { name: "Approve & publish" }).first().click();
    await expect.poll(async () => (await db.event.findUniqueOrThrow({ where: { id: created.id } })).status, { timeout: 15_000 }).toBe("REGISTRATION_OPEN");
    await page.goto(`/events/${created.slug}`);
    await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
    expect(await db.auditLog.count({ where: { entityId: created.id, action: "event.approve" } })).toBe(1);
  });
});
