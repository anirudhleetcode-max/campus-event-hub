import { expect, type APIRequestContext, type Cookie, type Page } from "@playwright/test";
import { E2E_CRON_SECRET } from "./constants";
import { PrismaClient } from "@prisma/client";

export const PASSWORD = "Demo@1234";
export const ACCOUNTS = {
  student: "student@northfield.demo",
  organizer: "organizer@northfield.demo",
  faculty: "faculty@northfield.demo",
  admin: "admin@northfield.demo",
  superAdmin: "super@demo.campushub.app",
  riversideOrganizer: "organizer@riverside.demo",
} as const;

export const db = new PrismaClient({ datasources: { db: { url: process.env.E2E_DATABASE_URL } } });

/** Session cookies per account, reused so the suite doesn't trip the login rate limiter. */
const sessions = new Map<string, Cookie[]>();

export async function login(page: Page, email: string, password = PASSWORD) {
  const cached = sessions.get(email);
  if (cached) {
    await page.context().clearCookies();
    await page.context().addCookies(cached);
    const probe = await page.request.get("/notifications", { maxRedirects: 0 });
    if (probe.status() === 200) {
      await page.goto("/dashboard"); // lands on the role's home, like a fresh sign-in
      return;
    }
    sessions.delete(email);
  }
  // Signed-in users are redirected away from /login, so sign in from a clean state.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  // The login form navigates client-side; wait until the signed-in shell has rendered
  // so the caller's next navigation can't race it.
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({ timeout: 20_000 });
  sessions.set(email, (await page.context().cookies()).filter((c) => c.name === "ceh_session"));
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** Fails if the page scrolls horizontally (layout overflow). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(1);
}

export const uid = () => Math.random().toString(36).slice(2, 8);

/** Runs the real time-driven status automation (the same endpoint Vercel Cron calls). */
export async function runStatusCron(request: APIRequestContext) {
  const res = await request.get("/api/cron/event-status", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  return (await res.json()) as { statusUpdates: number; completed: number };
}
