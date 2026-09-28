import path from "node:path";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://campus:campus@localhost:5432/campus_hub_test?schema=public";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      APP_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_DATABASE_URL: TEST_DATABASE_URL,
      AUTH_SECRET: "test-auth-secret-that-is-long-enough-1234567890",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      RAZORPAY_KEY_ID: "rzp_test_dummykey",
      RAZORPAY_KEY_SECRET: "test_key_secret",
      RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret",
      EMAIL_API_KEY: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});
