import { describe, expect, it } from "vitest";
import { inspectConfig, parseEmailFrom, summarizeConfig } from "@/server/config";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  DIRECT_DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "s".repeat(40),
  NEXT_PUBLIC_APP_URL: "https://events.college.edu",
};

const prodComplete = {
  ...base,
  APP_ENV: "production",
  CRON_SECRET: "c0ffee".repeat(6),
  RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456",
  RAZORPAY_KEY_SECRET: "live-key-secret-value",
  RAZORPAY_WEBHOOK_SECRET: "webhook-secret-value",
  EMAIL_API_KEY: "re_liveapikeyvalue",
  EMAIL_FROM: "Campus Event Hub <no-reply@mail.college.edu>",
  STORAGE_URL: "https://account.r2.cloudflarestorage.com",
  STORAGE_KEY: "storage-access-key",
  STORAGE_SECRET: "storage-secret-value",
  STORAGE_BUCKET: "campus-uploads",
  STORAGE_REGION: "auto",
  STORAGE_PUBLIC_URL: "https://cdn.college.edu",
};

describe("configuration report", () => {
  it("accepts a complete production configuration", () => {
    const r = inspectConfig(prodComplete);
    expect(r.ok).toBe(true);
    expect(summarizeConfig(r)).toEqual({ appEnv: "production", core: "PASS", razorpay: "CONFIGURED (LIVE)", email: "CONFIGURED", storage: "CONFIGURED", cron: "CONFIGURED" });
  });

  it("never includes secret values in the report", () => {
    const r = inspectConfig({ ...prodComplete, RAZORPAY_KEY_ID: "rzp_live_x", APP_ENV: "staging", EMAIL_FROM: "not an email", STORAGE_PUBLIC_URL: "" });
    const text = JSON.stringify(r);
    for (const key of ["AUTH_SECRET", "CRON_SECRET", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "EMAIL_API_KEY", "STORAGE_KEY", "STORAGE_SECRET"] as const) {
      expect(text).not.toContain(prodComplete[key]);
    }
    expect(r.ok).toBe(false);
  });

  it("development works with only the core variables", () => {
    const r = inspectConfig({ ...base, APP_ENV: "development" });
    expect(r.ok).toBe(true);
    expect([r.razorpay.status, r.email.status, r.storage.status, r.cron.status]).toEqual(["NOT_CONFIGURED", "NOT_CONFIGURED", "NOT_CONFIGURED", "NOT_CONFIGURED"]);
  });

  it("fails core checks clearly", () => {
    const r = inspectConfig({ APP_ENV: "production", AUTH_SECRET: "short", NEXT_PUBLIC_APP_URL: "http://insecure.example" });
    expect(r.core.ok).toBe(false);
    expect(r.core.errors.join(" ")).toMatch(/DATABASE_URL is required/);
    expect(r.core.errors.join(" ")).toMatch(/AUTH_SECRET must be at least 32/);
    expect(r.core.errors.join(" ")).toMatch(/https:\/\/ in production/);
  });

  it("allows LIVE Razorpay keys only when APP_ENV=production", () => {
    for (const APP_ENV of ["development", "staging", "test"]) {
      const r = inspectConfig({ ...prodComplete, APP_ENV });
      expect(r.razorpay.status, APP_ENV).toBe("MISCONFIGURED");
      expect(r.razorpay.errors[0]).toMatch(/only allowed when APP_ENV=production/);
    }
    const test = inspectConfig({ ...prodComplete, APP_ENV: "staging", RAZORPAY_KEY_ID: "rzp_test_AbC123" });
    expect(test.razorpay.status).toBe("CONFIGURED");
    expect(test.razorpay.details.mode).toBe("TEST");
    const prodWithTest = inspectConfig({ ...prodComplete, RAZORPAY_KEY_ID: "rzp_test_AbC123" });
    expect(prodWithTest.razorpay.status).toBe("CONFIGURED");
    expect(prodWithTest.razorpay.warnings.join(" ")).toMatch(/TEST Razorpay keys/);
  });

  it("flags partial or malformed Razorpay configuration", () => {
    expect(inspectConfig({ ...base, RAZORPAY_KEY_ID: "rzp_test_x" }).razorpay.errors).toContain("RAZORPAY_KEY_SECRET is missing.");
    expect(inspectConfig({ ...base, RAZORPAY_KEY_ID: "pk_abc", RAZORPAY_KEY_SECRET: "x" }).razorpay.status).toBe("MISCONFIGURED");
    const noWebhookProd = inspectConfig({ ...prodComplete, RAZORPAY_WEBHOOK_SECRET: "" });
    expect(noWebhookProd.razorpay.status).toBe("MISCONFIGURED");
    const noWebhookDev = inspectConfig({ ...base, RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "x" });
    expect(noWebhookDev.razorpay.status).toBe("CONFIGURED");
    expect(noWebhookDev.razorpay.warnings.join(" ")).toMatch(/RAZORPAY_WEBHOOK_SECRET/);
  });

  it("validates EMAIL_FROM", () => {
    expect(parseEmailFrom("Campus Event Hub <no-reply@mail.college.edu>")).toBe("no-reply@mail.college.edu");
    expect(parseEmailFrom("events@college.edu")).toBe("events@college.edu");
    expect(parseEmailFrom('"Events Team" <events@college.edu>')).toBe("events@college.edu");
    expect(parseEmailFrom("Campus Event Hub")).toBeNull();
    expect(parseEmailFrom("a@b")).toBeNull();
    expect(parseEmailFrom(undefined)).toBeNull();
    expect(inspectConfig({ ...base, EMAIL_API_KEY: "re_x" }).email.status).toBe("MISCONFIGURED");
    expect(inspectConfig({ ...base, EMAIL_API_KEY: "re_x", EMAIL_FROM: "bad" }).email.status).toBe("MISCONFIGURED");
    const placeholder = { EMAIL_API_KEY: "re_x", EMAIL_FROM: "Campus Event Hub <no-reply@yourdomain.com>" };
    expect(inspectConfig({ ...prodComplete, ...placeholder }).email.status).toBe("MISCONFIGURED");
    expect(inspectConfig({ ...base, ...placeholder }).email.status).toBe("CONFIGURED");
  });

  it("requires complete storage configuration, and storage in production", () => {
    expect(inspectConfig({ ...prodComplete, STORAGE_BUCKET: "", STORAGE_KEY: "", STORAGE_SECRET: "" }).storage.status).toBe("MISCONFIGURED");
    const partial = inspectConfig({ ...base, STORAGE_BUCKET: "b", STORAGE_KEY: "k" });
    expect(partial.storage.errors).toContain("STORAGE_SECRET is missing (partial storage configuration).");
    expect(inspectConfig({ ...prodComplete, STORAGE_PUBLIC_URL: "" }).storage.errors.join(" ")).toMatch(/STORAGE_PUBLIC_URL is required/);
    const aws = { ...prodComplete, STORAGE_URL: "" };
    expect(inspectConfig(aws).storage.errors.join(" ")).toMatch(/STORAGE_REGION must be a real AWS region/);
    expect(inspectConfig({ ...aws, STORAGE_REGION: "ap-south-1" }).storage.status).toBe("CONFIGURED");
  });

  it("requires a strong CRON_SECRET in production", () => {
    expect(inspectConfig({ ...prodComplete, CRON_SECRET: "" }).cron.status).toBe("MISCONFIGURED");
    expect(inspectConfig({ ...prodComplete, CRON_SECRET: "short" }).cron.status).toBe("MISCONFIGURED");
    expect(inspectConfig({ ...base, CRON_SECRET: "" }).cron.status).toBe("NOT_CONFIGURED");
  });
});
