import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, db, login } from "./helpers";

/** Automated WCAG 2 A/AA checks (axe-core) on the main pages of every role. */
async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Recharts' SVG internals are covered by an accessible table view and aria-label on the chart container.
    .exclude(".recharts-wrapper")
    .analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} :: ${n.html.slice(0, 160)} :: ${n.failureSummary?.split("\n").slice(1, 2).join(" ")}`).join("\n    ")}`);
  expect(serious, `${path}\n${summary.join("\n")}`).toEqual([]);
}

test("public pages", async ({ page }) => {
  const hack = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
  for (const path of ["/", "/events", `/events/${hack.slug}`, "/about", "/login", "/signup", "/verify"]) await audit(page, path);
});

test("student pages", async ({ page }) => {
  await login(page, ACCOUNTS.student);
  const reg = await db.registration.findFirstOrThrow({ where: { user: { email: ACCOUNTS.student }, status: "CONFIRMED" } });
  for (const path of ["/dashboard", "/my/registrations", `/my/registrations/${reg.id}`, "/my/certificates", "/my/payments", "/notifications", "/profile"]) await audit(page, path);
});

test("organizer pages", async ({ page }) => {
  await login(page, ACCOUNTS.organizer);
  const hack = await db.event.findFirstOrThrow({ where: { title: "HackNorth 2026" } });
  for (const path of ["/organizer/dashboard", "/organizer/events", "/organizer/events/new", `/organizer/events/${hack.id}`, `/organizer/events/${hack.id}/registrations`, `/organizer/events/${hack.id}/scan`, `/organizer/events/${hack.id}/analytics`]) await audit(page, path);
});

test("admin pages", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  for (const path of ["/admin/dashboard", "/admin/users", "/admin/events", "/admin/payments", "/admin/audit-logs", "/admin/notifications"]) await audit(page, path);
});
