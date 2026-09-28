/**
 * Configuration inspection shared by the app (startup + runtime guards), the
 * `npm run check:config` CLI and the tests.
 *
 * Pure and dependency-free on purpose: it takes an env record and returns a
 * report. The report NEVER contains a variable's value — only its name and
 * what is wrong with it — so it is safe to log or print.
 */

export type AppEnv = "development" | "staging" | "production" | "test";
export type IntegrationStatus = "CONFIGURED" | "NOT_CONFIGURED" | "MISCONFIGURED";

export type IntegrationReport = {
  status: IntegrationStatus;
  /** Problems that break the integration (or production) — must be fixed. */
  errors: string[];
  /** Worth fixing, but the app works. */
  warnings: string[];
  /** Non-secret facts, e.g. Razorpay TEST/LIVE mode. */
  details: Record<string, string>;
};

export type ConfigReport = {
  appEnv: AppEnv;
  core: { ok: boolean; errors: string[]; warnings: string[] };
  razorpay: IntegrationReport;
  email: IntegrationReport;
  storage: IntegrationReport;
  cron: IntegrationReport;
  /** True when nothing would stop this deployment from working correctly. */
  ok: boolean;
};

type Env = Record<string, string | undefined>;

const PLACEHOLDER = /(yourdomain|example\.(com|org|net)|changeme|replace[-_ ]?me|xxx+)/i;
const EMAIL_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function val(e: Env, key: string): string | undefined {
  const v = e[key]?.trim();
  return v ? v : undefined;
}

function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function readAppEnv(e: Env): AppEnv {
  const v = val(e, "APP_ENV");
  return v === "staging" || v === "production" || v === "test" ? v : "development";
}

/**
 * Parses EMAIL_FROM: `Name <addr@domain>` or `addr@domain`. Returns the bare
 * address, or null when the value is not a usable sender.
 */
export function parseEmailFrom(from: string | undefined): string | null {
  if (!from) return null;
  const m = from.trim().match(/^(?:"?([^"<>]*)"?\s*)?<([^<>]+)>$/);
  const addr = (m ? m[2]! : from.trim()).trim();
  return EMAIL_ADDRESS.test(addr) ? addr : null;
}

function finish(errors: string[], warnings: string[], details: Record<string, string>, configured: boolean): IntegrationReport {
  return { status: errors.length ? "MISCONFIGURED" : configured ? "CONFIGURED" : "NOT_CONFIGURED", errors, warnings, details };
}

function inspectCore(e: Env, appEnv: AppEnv) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prod = appEnv === "production";
  const rawAppEnv = val(e, "APP_ENV");
  if (rawAppEnv && !["development", "staging", "production", "test"].includes(rawAppEnv)) {
    errors.push("APP_ENV must be one of development, staging, production, test.");
  }
  if (!val(e, "DATABASE_URL")) errors.push("DATABASE_URL is required.");
  else if (!/^postgres(ql)?:\/\//.test(val(e, "DATABASE_URL")!)) errors.push("DATABASE_URL must be a postgresql:// connection string.");
  if (!val(e, "DIRECT_DATABASE_URL")) {
    (prod ? errors : warnings).push("DIRECT_DATABASE_URL is not set; migrations and realtime (LISTEN/NOTIFY) need a direct, non-pooled connection.");
  }
  const auth = val(e, "AUTH_SECRET");
  if (!auth) errors.push("AUTH_SECRET is required (32+ characters; generate with `openssl rand -base64 32`).");
  else if (auth.length < 32) errors.push("AUTH_SECRET must be at least 32 characters.");
  else if (PLACEHOLDER.test(auth)) errors.push("AUTH_SECRET looks like a placeholder; generate a random value.");
  const url = val(e, "NEXT_PUBLIC_APP_URL") ?? val(e, "RENDER_EXTERNAL_URL");
  if (!url) {
    (prod ? errors : warnings).push("NEXT_PUBLIC_APP_URL is not set (defaults to http://localhost:3000).");
  } else if (!isUrl(url)) {
    errors.push("NEXT_PUBLIC_APP_URL must be an absolute http(s) URL.");
  } else if (prod && !url.startsWith("https://")) {
    errors.push("NEXT_PUBLIC_APP_URL must use https:// in production.");
  }
  return { ok: errors.length === 0, errors, warnings };
}

function inspectRazorpay(e: Env, appEnv: AppEnv): IntegrationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, string> = {};
  const keyId = val(e, "RAZORPAY_KEY_ID");
  const secret = val(e, "RAZORPAY_KEY_SECRET");
  const webhook = val(e, "RAZORPAY_WEBHOOK_SECRET");
  if (!keyId && !secret && !webhook) {
    warnings.push("Razorpay is not configured: paid registrations are refused with a clear message (free events work).");
    return finish(errors, warnings, details, false);
  }
  if (!keyId) errors.push("RAZORPAY_KEY_ID is missing.");
  if (!secret) errors.push("RAZORPAY_KEY_SECRET is missing.");
  if (keyId) {
    const mode = /^rzp_live_/.test(keyId) ? "LIVE" : /^rzp_test_/.test(keyId) ? "TEST" : null;
    if (!mode) errors.push("RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_.");
    else {
      details.mode = mode;
      if (mode === "LIVE" && appEnv !== "production") {
        errors.push("LIVE Razorpay keys (rzp_live_) are only allowed when APP_ENV=production; use TEST keys (rzp_test_) here.");
      }
      if (mode === "TEST" && appEnv === "production") {
        warnings.push("Production is using TEST Razorpay keys: no real money will be collected.");
      }
    }
  }
  if (!webhook) {
    (appEnv === "production" ? errors : warnings).push(
      "RAZORPAY_WEBHOOK_SECRET is missing: webhooks (payment/refund confirmations sent by Razorpay) will be rejected.",
    );
  }
  if (secret && webhook && secret === webhook) warnings.push("RAZORPAY_WEBHOOK_SECRET should differ from RAZORPAY_KEY_SECRET.");
  return finish(errors, warnings, details, true);
}

function inspectEmail(e: Env, appEnv: AppEnv): IntegrationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, string> = {};
  const key = val(e, "EMAIL_API_KEY");
  const from = val(e, "EMAIL_FROM");
  if (!key) {
    warnings.push("Email is not configured: in-app notifications still work; emails are recorded in email_logs as SKIPPED.");
    return finish(errors, warnings, details, false);
  }
  details.provider = "resend";
  if (!key.startsWith("re_")) warnings.push("EMAIL_API_KEY does not look like a Resend API key (expected prefix re_).");
  const addr = parseEmailFrom(from);
  if (!from) errors.push('EMAIL_FROM is required when EMAIL_API_KEY is set, e.g. "Campus Event Hub <no-reply@your-verified-domain.com>".');
  else if (!addr) errors.push('EMAIL_FROM is not a valid sender; use "Name <address@domain>" or "address@domain".');
  else {
    details.senderDomain = addr.split("@")[1]!;
    if (PLACEHOLDER.test(addr)) {
      (appEnv === "production" ? errors : warnings).push("EMAIL_FROM uses a placeholder domain; use a domain verified in Resend.");
    }
  }
  return finish(errors, warnings, details, true);
}

function inspectStorage(e: Env, appEnv: AppEnv): IntegrationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, string> = {};
  const required = ["STORAGE_BUCKET", "STORAGE_KEY", "STORAGE_SECRET"] as const;
  const present = required.filter((k) => val(e, k));
  const endpoint = val(e, "STORAGE_URL");
  const publicUrl = val(e, "STORAGE_PUBLIC_URL");
  if (present.length === 0) {
    if (appEnv === "production") errors.push("S3-compatible storage is required in production (STORAGE_BUCKET, STORAGE_KEY, STORAGE_SECRET, STORAGE_PUBLIC_URL); uploads fail without it.");
    else warnings.push("Cloud storage is not configured: uploads are stored locally in .data/uploads.");
    return finish(errors, warnings, details, false);
  }
  for (const k of required) if (!val(e, k)) errors.push(`${k} is missing (partial storage configuration).`);
  if (endpoint && !isUrl(endpoint)) errors.push("STORAGE_URL must be an absolute http(s) URL (the S3 API endpoint), or empty for AWS S3.");
  if (!publicUrl) errors.push("STORAGE_PUBLIC_URL is required: it is the public base URL of uploaded files and is added to the Content Security Policy at build time.");
  else if (!isUrl(publicUrl)) errors.push("STORAGE_PUBLIC_URL must be an absolute http(s) URL.");
  else if (appEnv === "production" && !publicUrl.startsWith("https://")) errors.push("STORAGE_PUBLIC_URL must use https:// in production.");
  const region = val(e, "STORAGE_REGION");
  if (!endpoint && (!region || region === "auto")) errors.push("STORAGE_REGION must be a real AWS region (e.g. ap-south-1) when STORAGE_URL is empty (AWS S3).");
  details.provider = endpoint ? "s3-compatible" : "aws-s3";
  return finish(errors, warnings, details, true);
}

function inspectCron(e: Env, appEnv: AppEnv): IntegrationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const secret = val(e, "CRON_SECRET");
  if (!secret) {
    (appEnv === "production" ? errors : warnings).push(
      "CRON_SECRET is not set: /api/cron/* reject every call, so reminders, automatic status changes, feedback requests and seat-hold expiry won't run.",
    );
    return finish(errors, warnings, {}, false);
  }
  if (secret.length < 16) errors.push("CRON_SECRET must be at least 16 characters (generate with `openssl rand -hex 24`).");
  else if (PLACEHOLDER.test(secret)) errors.push("CRON_SECRET looks like a placeholder; generate a random value.");
  return finish(errors, warnings, {}, true);
}

export function inspectConfig(e: Env = process.env): ConfigReport {
  const appEnv = readAppEnv(e);
  const core = inspectCore(e, appEnv);
  const razorpay = inspectRazorpay(e, appEnv);
  const email = inspectEmail(e, appEnv);
  const storage = inspectStorage(e, appEnv);
  const cron = inspectCron(e, appEnv);
  const ok = core.ok && [razorpay, email, storage, cron].every((r) => r.errors.length === 0);
  return { appEnv, core, razorpay, email, storage, cron, ok };
}

/** One-line, value-free summary for logs. */
export function summarizeConfig(r: ConfigReport): Record<string, string> {
  return {
    appEnv: r.appEnv,
    core: r.core.ok ? "PASS" : "FAIL",
    razorpay: r.razorpay.status + (r.razorpay.details.mode ? ` (${r.razorpay.details.mode})` : ""),
    email: r.email.status,
    storage: r.storage.status,
    cron: r.cron.status,
  };
}
