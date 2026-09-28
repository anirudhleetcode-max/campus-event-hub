import { expect, test } from "@playwright/test";
import { ACCOUNTS, db, login } from "./helpers";

test.describe("admin", () => {
  test("college admin dashboard shows live database metrics and filters", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    const confirmed = await db.registration.count({
      where: { status: "CONFIRMED", event: { college: { slug: "northfield-institute" } }, confirmedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    });
    await expect(page.getByText("Registrations").first()).toBeVisible();
    await expect(page.getByText(confirmed.toLocaleString("en-IN")).first()).toBeVisible();
    await page.getByLabel("Date range").selectOption("year");
    await expect(page).toHaveURL(/range=year/);
    await expect(page.getByText("This year").first()).toBeVisible();
  });

  test("user management: search, suspend (with confirmation) and reactivate", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/users");
    await page.getByRole("searchbox", { name: "Search users" }).fill("student3@");
    await expect(page).toHaveURL(/q=student3/);
    await expect(page.getByText("student3@northfield.demo")).toBeVisible();
    await page.getByRole("button", { name: /^Suspend / }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspend user" }).click();
    await expect(page.getByText("User suspended and signed out.")).toBeVisible();
    expect((await db.user.findUniqueOrThrow({ where: { email: "student3@northfield.demo" } })).status).toBe("SUSPENDED");
    await page.getByRole("button", { name: /^Activate / }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("User activated.")).toBeVisible();
    await page.goto("/admin/audit-logs?action=user.");
    await expect(page.getByText("user.suspended").first()).toBeVisible();
  });

  test("college admin only sees their own college", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/users?q=riverside");
    await expect(page.getByText("No users match these filters")).toBeVisible();
    await page.goto("/admin/colleges");
    await expect(page).toHaveURL(/\/admin\/colleges\/[0-9a-f-]{36}/);
    const riverside = await db.college.findUniqueOrThrow({ where: { slug: "riverside-college" } });
    expect((await page.goto(`/admin/colleges/${riverside.id}`))?.status()).toBe(404);
    await page.goto("/admin/settings");
    await expect(page).not.toHaveURL(/\/admin\/settings/);
  });

  test("admin pages render for every section", async ({ page }) => {
    await login(page, ACCOUNTS.superAdmin);
    for (const path of ["/admin/events", "/admin/users", "/admin/colleges", "/admin/departments", "/admin/payments", "/admin/attendance", "/admin/certificates", "/admin/analytics", "/admin/notifications", "/admin/audit-logs", "/admin/settings"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });

  test("announcements reach recipients", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto("/admin/notifications");
    await page.getByLabel("Title").fill("E2E campus notice");
    await page.getByLabel("Message").fill("Testing announcements end to end.");
    await page.getByRole("button", { name: "Send announcement" }).click();
    await expect(page.getByText(/Announcement delivered to/)).toBeVisible();
    const student = await db.user.findUniqueOrThrow({ where: { email: ACCOUNTS.student } });
    expect(await db.notification.count({ where: { userId: student.id, title: "E2E campus notice" } })).toBe(1);
  });

  test("CSV export downloads for admins", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    const res = await page.request.get("/api/exports/payments");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(await res.text()).toContain("Payment ID");
  });
});
