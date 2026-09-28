import { defineConfig, devices } from "@playwright/test";
import { E2E_CRON_SECRET } from "./tests/e2e/constants";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
/**
 * E2E runs against its own database so it never touches development data.
 * It is created, migrated and re-seeded by tests/e2e/prepare-db.ts, which runs
 * as part of the webServer command below (Playwright starts webServer before
 * globalSetup, so preparation can't live in globalSetup).
 */
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://campus:campus@localhost:5432/campus_hub_e2e?schema=public";
process.env.E2E_DATABASE_URL = E2E_DATABASE_URL;


/**
 * End-to-end tests run against a production build: `npm run build` first,
 * then `npm run test:e2e`. Set PLAYWRIGHT_CHROMIUM_PATH to use a pre-installed
 * Chromium instead of downloading one.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx tsx tests/e2e/prepare-db.ts && npx next start -p ${PORT}`,
        url: `${baseURL}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: { E2E_DATABASE_URL, NEXT_PUBLIC_APP_URL: baseURL, DATABASE_URL: E2E_DATABASE_URL, DIRECT_DATABASE_URL: E2E_DATABASE_URL, APP_ENV: "test", CRON_SECRET: E2E_CRON_SECRET },
      },
});
