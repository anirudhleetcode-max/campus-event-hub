import { expect, test } from "@playwright/test";
import { ACCOUNTS, db, expectNoHorizontalOverflow, login } from "./helpers";

const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 640 },
  { name: "mobile-375", width: 375, height: 740 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 800 },
];

async function eventSlug() {
  return (await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } })).slug;
}

for (const vp of VIEWPORTS) {
  test.describe(`responsive @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("public pages have no horizontal overflow", async ({ page }) => {
      for (const path of ["/", "/events", `/events/${await eventSlug()}`, "/about", "/login", "/signup", "/verify"]) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
      if (vp.width < 768) {
        await page.goto("/");
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(page.getByRole("dialog").getByRole("link", { name: "Events" })).toBeVisible();
      }
    });

    test("student pages have no horizontal overflow", async ({ page }) => {
      await login(page, ACCOUNTS.student);
      const reg = await db.registration.findFirstOrThrow({ where: { user: { email: ACCOUNTS.student }, status: "CONFIRMED" } });
      for (const path of ["/dashboard", "/my/registrations", `/my/registrations/${reg.id}`, "/my/certificates", "/my/payments", "/my/attendance", "/notifications", "/profile"]) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
      if (vp.width < 1024) {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await expect(page.getByRole("dialog").getByRole("link", { name: "My Registrations" })).toBeVisible();
      }
    });

    test("organizer and admin pages have no horizontal overflow", async ({ page }) => {
      await login(page, ACCOUNTS.admin);
      const ev = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
      for (const path of ["/admin/dashboard", "/admin/users", "/admin/payments", "/admin/audit-logs", "/organizer/events", `/organizer/events/${ev.id}`, `/organizer/events/${ev.id}/registrations`, `/organizer/events/${ev.id}/analytics`, "/organizer/events/new"]) {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
      }
    });
  });
}
