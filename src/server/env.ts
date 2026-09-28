import "server-only";
import { z } from "zod";

/**
 * Server environment. Validated lazily on first access so that `next build`
 * can run without runtime secrets, while any request touching a missing
 * required value fails loudly instead of silently misbehaving.
 */
const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  STORAGE_URL: z.string().optional(),
  STORAGE_KEY: z.string().optional(),
  STORAGE_SECRET: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const blankToUndefined = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = schema.safeParse(blankToUndefined);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().APP_ENV === "production";

export function appUrl(path = ""): string {
  return new URL(path, env().NEXT_PUBLIC_APP_URL).toString();
}

export function razorpayConfigured(): boolean {
  const e = env();
  return Boolean(e.RAZORPAY_KEY_ID && e.RAZORPAY_KEY_SECRET);
}

/** Razorpay keys are prefixed rzp_test_ / rzp_live_. */
export function razorpayMode(): "TEST" | "LIVE" {
  return env().RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "LIVE" : "TEST";
}
