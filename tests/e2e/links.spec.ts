import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

/**
 * Route inventory check: every internal link rendered on each role's main
 * pages must resolve (no 404s or 500s from generated links such as table rows
 * or pagination).
 */
async function collectLinks(page: Page, entryPages: string[]) {
  const links = new Set<string>();
  for (const entry of entryPages) {
    const res = await page.goto(entry);
    expect(res?.status(), `entry ${entry}`).toBeLessThan(400);
    const hrefs = await page.$$eval("a[href^='/']:not([download])", (as) => as.map((a) => a.getAttribute("href")!));
    hrefs.filter((h) => !h.startsWith("/api/") && !h.startsWith("/uploads/") && !h.includes("#")).forEach((h) => links.add(h));
  }
  return [...links].sort();
}

async function assertAllResolve(page: Page, links: string[]) {
  const broken: string[] = [];
  for (const href of links) {
    const res = await page.request.get(href, { maxRedirects: 5 });
    if (res.status() >= 400) broken.push(`${res.status()} ${href}`);
  }
  expect(broken, `broken links:\n${broken.join("\n")}`).toEqual([]);
  expect(links.length).toBeGreaterThan(5);
}

test("public site links resolve", async ({ page }) => {
  await assertAllResolve(page, await collectLinks(page, ["/", "/events", "/events?when=past", "/about", "/verify", "/login", "/signup"]));
});

test("student links resolve", async ({ page }) => {
  await login(page, ACCOUNTS.student);
  await assertAllResolve(page, await collectLinks(page, ["/dashboard", "/my/registrations", "/my/certificates", "/my/payments", "/my/attendance", "/notifications", "/profile"]));
});

test("organizer links resolve", async ({ page }) => {
  await login(page, ACCOUNTS.organizer);
  await assertAllResolve(page, await collectLinks(page, ["/organizer/dashboard", "/organizer/events", "/organizer/events?page=2", "/organizer/registrations", "/organizer/attendance", "/organizer/certificates", "/organizer/feedback", "/organizer/analytics"]));
});

test("admin links resolve (including event table rows and pagination)", async ({ page }) => {
  await login(page, ACCOUNTS.superAdmin);
  const links = await collectLinks(page, ["/admin/dashboard", "/admin/events", "/admin/users", "/admin/colleges", "/admin/departments", "/admin/payments", "/admin/attendance", "/admin/certificates", "/admin/audit-logs"]);
  expect(links.some((l) => /^\/organizer\/events\/[0-9a-f-]{36}$/.test(l)), "event table links to event pages").toBe(true);
  expect(links.some((l) => l.startsWith("/admin/users?") && l.includes("page=2")), "user pagination link").toBe(true);
  await assertAllResolve(page, links);
});
