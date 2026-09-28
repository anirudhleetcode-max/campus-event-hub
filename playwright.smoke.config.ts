import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against an already running deployment (no web server, no DB access):
 *   SMOKE_BASE_URL=https://your-app.onrender.com npm run test:smoke
 */
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error("Set SMOKE_BASE_URL to the deployed app's URL, e.g. https://campus-event-hub.onrender.com");

export default defineConfig({
  testDir: "tests/smoke",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Free hosting tiers can cold-start; allow generous time for the first request.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL,
    navigationTimeout: 90_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
