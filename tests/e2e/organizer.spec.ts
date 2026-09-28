import { expect, test } from "@playwright/test";
import { ACCOUNTS, db, login, logout } from "./helpers";

// The end-to-end organizer workflow (wizard → approval → scan → certificates →
// analytics) lives in lifecycle.spec.ts. This file covers organizer-area
// navigation and permission boundaries.

test.describe("organizer area", () => {
  test("cross-event pages and event tabs render for the organizer", async ({ page }) => {
    await login(page, ACCOUNTS.organizer);
    for (const path of ["/organizer/dashboard", "/organizer/events", "/organizer/registrations", "/organizer/attendance", "/organizer/certificates", "/organizer/feedback", "/organizer/analytics"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
    const hack = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
    for (const tab of ["", "/registrations", "/attendance", "/scan", "/payments", "/certificates", "/feedback", "/analytics", "/edit"]) {
      const res = await page.goto(`/organizer/events/${hack.id}${tab}`);
      expect(res?.status(), tab || "overview").toBe(200);
    }
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

  test("faculty coordinator is read-only on assigned events", async ({ page }) => {
    const hack = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
    await login(page, ACCOUNTS.faculty);
    await page.goto(`/organizer/events/${hack.id}/registrations`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await page.goto(`/organizer/events/${hack.id}/edit`);
    await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
    await expect(page.getByText("You have read-only access to this event.")).toBeVisible();
  });

  test("organizers cannot see, export or scan for another college's events", async ({ page }) => {
    const hack = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
    await login(page, ACCOUNTS.riversideOrganizer);
    await page.goto(`/organizer/events/${hack.id}/registrations`);
    await expect(page.getByText(/permission/i).first()).toBeVisible();
    for (const kind of ["registrations", "payments", "attendance", "certificates", "feedback", "analytics"]) {
      expect((await page.request.get(`/api/exports/${kind}?eventId=${hack.id}`)).status(), kind).toBe(403);
    }
    expect((await page.request.get(`/api/events/${hack.id}/report`)).status()).toBe(403);
    const reg = await db.registration.findFirstOrThrow({ where: { eventId: hack.id, status: "CONFIRMED" } });
    const scan = await page.request.post("/api/attendance/scan", { data: { eventId: hack.id, payload: `CEH1:${reg.qrToken}` }, headers: { origin: new URL(page.url()).origin } });
    expect(scan.status()).toBe(403);
    expect(await db.attendance.count({ where: { registrationId: reg.id } })).toBe(0);

    // Cross-event hubs only list the organizer's own events: the HackNorth registration
    // (unique ID) must not appear, even if the same student also registered for a Riverside event.
    await page.goto(`/organizer/registrations?q=${reg.code}`);
    await expect(page.getByText(reg.code)).toHaveCount(0);
    // Positive control: the owning organizer's identical search does find it.
    await login(page, ACCOUNTS.organizer);
    await page.goto(`/organizer/registrations?q=${reg.code}`);
    await expect(page.getByText(reg.code).first()).toBeVisible();
  });

  test("a student volunteer can only reach the scanner", async ({ page }) => {
    const robotics = await db.event.findFirstOrThrow({ where: { title: { startsWith: "Robotics Expo" } } });
    const volunteer = await db.eventVolunteer.findFirstOrThrow({ where: { eventId: robotics.id, role: "VOLUNTEER" }, include: { user: true } });
    await logout(page);
    await login(page, volunteer.user.email);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Open scanner" }).first()).toBeVisible();
    expect((await page.goto(`/organizer/events/${robotics.id}/scan`))?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Start scanning" })).toBeVisible();
    await page.goto(`/organizer/events/${robotics.id}/registrations`);
    await expect(page.getByText(/permission/i).first()).toBeVisible();
    expect((await page.request.get(`/api/exports/registrations?eventId=${robotics.id}`)).status()).toBe(403);
  });
});
