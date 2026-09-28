import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { resetEnvCache, razorpayConfigured } from "@/server/env";
import { AppError } from "@/server/errors";
import { asSession, makeCollege, makeEvent, makeUser, prisma, resetDb } from "../helpers";

// The S3 client is replaced by a recorder: the tests check exactly what would be
// sent to the bucket. (The real SDK path is exercised against an S3-compatible
// server separately — see docs/PROJECT_REVIEW.md.)
const s3 = vi.hoisted(() => ({ configs: [] as unknown[], puts: [] as Record<string, unknown>[] }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config: unknown) {
      s3.configs.push(config);
    }
    async send(cmd: { input: Record<string, unknown> }) {
      s3.puts.push(cmd.input);
      return {};
    }
  },
  PutObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}));

const { sendEmail } = await import("@/server/mailer");
const { storeImage, canUpload, readLocalUpload } = await import("@/server/storage");
const { registerForEvent } = await import("@/server/services/registrations");
const { handleRazorpayWebhook } = await import("@/server/services/payments");
const eventStatusCron = await import("@/app/api/cron/event-status/route");
const remindersCron = await import("@/app/api/cron/reminders/route");
const cleanupCron = await import("@/app/api/cron/cleanup/route");

const H = 3_600_000;
const saved = { ...process.env };

/** Applies env overrides for one test (restored in afterEach). */
function setEnv(patch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnvCache();
}

/** Captures everything the app logs, to prove secrets never appear in it. */
function captureLogs() {
  const lines: string[] = [];
  for (const m of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" ")));
  }
  return lines;
}

afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await resetDb();
  s3.configs.length = 0;
  s3.puts.length = 0;
});

const message = { to: "student@college.test", subject: "Hello", template: "TEST", html: "<p>Hi</p>", text: "Hi" };
const EMAIL_ENV = { EMAIL_API_KEY: "re_secret_api_key_value", EMAIL_FROM: "Campus Event Hub <events@college.test>" };

describe("email (Resend)", () => {
  it("sends through the Resend API and records the provider id", async () => {
    setEnv(EMAIL_ENV);
    const fetchMock = vi.fn(async () => Response.json({ id: "email_123" }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_secret_api_key_value");
    expect(JSON.parse(String(init.body))).toMatchObject({ from: EMAIL_ENV.EMAIL_FROM, to: [message.to], subject: "Hello" });
    const log = await prisma.emailLog.findFirstOrThrow();
    expect(log).toMatchObject({ status: "SENT", providerId: "email_123", template: "TEST" });
  });

  it("records a provider failure without throwing or logging the API key", async () => {
    setEnv(EMAIL_ENV);
    const logs = captureLogs();
    const fetchMock = vi.fn(async () => new Response('{"message":"The domain is not verified"}', { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendEmail(message)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // 4xx other than 429 is not retried
    const log = await prisma.emailLog.findFirstOrThrow();
    expect(log.status).toBe("FAILED");
    expect(log.error).toMatch(/403.*domain is not verified/);
    expect(logs.join("\n")).toMatch(/Email delivery failed/);
    expect(logs.join("\n") + JSON.stringify(log)).not.toContain(EMAIL_ENV.EMAIL_API_KEY);
  });

  it("retries once on rate limiting, and survives a network error", async () => {
    setEnv(EMAIL_ENV);
    const limited = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429, headers: { "retry-after": "0.01" } }))
      .mockResolvedValueOnce(Response.json({ id: "email_after_retry" }));
    vi.stubGlobal("fetch", limited);
    await sendEmail(message);
    expect(limited).toHaveBeenCalledTimes(2);
    expect((await prisma.emailLog.findFirstOrThrow()).providerId).toBe("email_after_retry");

    captureLogs();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(sendEmail({ ...message, template: "NET" })).resolves.toBeUndefined();
    expect((await prisma.emailLog.findFirstOrThrow({ where: { template: "NET" } })).status).toBe("FAILED");
  });

  it("skips email when EMAIL_API_KEY is missing", async () => {
    setEnv({ EMAIL_API_KEY: undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await prisma.emailLog.findFirstOrThrow()).status).toBe("SKIPPED");
  });

  it("refuses to send with a missing or invalid EMAIL_FROM", async () => {
    captureLogs();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const from of [undefined, "Campus Event Hub"]) {
      setEnv({ EMAIL_API_KEY: EMAIL_ENV.EMAIL_API_KEY, EMAIL_FROM: from });
      await sendEmail(message);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    const logs = await prisma.emailLog.findMany();
    expect(logs.map((l) => [l.status, l.error])).toEqual([
      ["FAILED", "EMAIL_FROM is missing or invalid"],
      ["FAILED", "EMAIL_FROM is missing or invalid"],
    ]);
  });

  it("an email outage never affects registration state or in-app notifications", async () => {
    setEnv(EMAIL_ENV);
    captureLogs();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500, headers: { "retry-after": "0.01" } })));
    const college = await makeCollege();
    const org = await makeUser("EVENT_ORGANIZER", college.id);
    const event = await makeEvent({ collegeId: college.id, organizerId: org.id });
    const student = await makeUser("STUDENT", college.id);
    await registerForEvent(asSession(student), { eventId: event.id });
    expect((await prisma.registration.findFirstOrThrow({ where: { eventId: event.id, userId: student.id } })).status).toBe("CONFIRMED");
    expect(await prisma.notification.count({ where: { userId: student.id, type: "REGISTRATION_CONFIRMED" } })).toBe(1);
    const log = await prisma.emailLog.findFirstOrThrow({ where: { template: "REGISTRATION_CONFIRMED" } });
    expect(log.status).toBe("FAILED");
  });
});

async function png(size: number) {
  return QRCode.toBuffer("storage test", { width: size, margin: 0 });
}

const S3_ENV = {
  STORAGE_URL: "https://account.r2.cloudflarestorage.com",
  STORAGE_KEY: "storage-access-key",
  STORAGE_SECRET: "storage-secret-value",
  STORAGE_BUCKET: "campus-uploads",
  STORAGE_REGION: "auto",
  STORAGE_PUBLIC_URL: "https://cdn.college.test",
};

describe("storage (S3-compatible)", () => {
  const owner = "0b6f3c2e-8a55-4c1e-9d7a-1f2e3d4c5b6a";

  it("uploads validated images to the bucket and returns the public URL", async () => {
    setEnv(S3_ENV);
    const buf = await png(128);
    const stored = await storeImage(buf, "avatar", owner);
    expect(s3.configs).toHaveLength(1);
    expect(s3.configs[0]).toMatchObject({ region: "auto", endpoint: S3_ENV.STORAGE_URL, forcePathStyle: true, credentials: { accessKeyId: "storage-access-key", secretAccessKey: "storage-secret-value" } });
    expect(s3.puts).toHaveLength(1);
    const put = s3.puts[0]!;
    expect(put).toMatchObject({ Bucket: "campus-uploads", ContentType: "image/png" });
    expect(put.Key).toMatch(new RegExp(`^avatar/${owner}/\\d+-[A-Za-z0-9_-]+\\.png$`));
    expect(stored).toEqual({ url: `${S3_ENV.STORAGE_PUBLIC_URL}/${put.Key}`, width: 128, height: 128 });
  });

  it("validates type, size and dimensions before anything reaches the bucket", async () => {
    setEnv(S3_ENV);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    await expect(storeImage(svg, "avatar", owner)).rejects.toThrow(/Only PNG, JPEG or WebP/);
    await expect(storeImage(await png(32), "avatar", owner)).rejects.toThrow(/at least 64×64/);
    await expect(storeImage(await png(400), "banner", owner)).rejects.toThrow(/at least 800×300/);
    await expect(storeImage(Buffer.concat([await png(128), Buffer.alloc(2 * 1024 * 1024)]), "avatar", owner)).rejects.toThrow(/smaller than 2 MB/);
    expect(s3.puts).toHaveLength(0);
  });

  it("refuses to upload with a partial storage configuration instead of silently using local disk", async () => {
    captureLogs();
    setEnv({ ...S3_ENV, STORAGE_SECRET: undefined });
    await expect(storeImage(await png(128), "avatar", owner)).rejects.toMatchObject({ code: "INTERNAL" });
    setEnv({ ...S3_ENV, STORAGE_PUBLIC_URL: undefined });
    await expect(storeImage(await png(128), "avatar", owner)).rejects.toMatchObject({ code: "INTERNAL" });
    expect(s3.puts).toHaveLength(0);
  });

  it("requires cloud storage in production and uses .data/uploads in development", async () => {
    setEnv({ APP_ENV: "production", STORAGE_BUCKET: undefined, STORAGE_KEY: undefined, STORAGE_SECRET: undefined });
    await expect(storeImage(await png(128), "avatar", owner)).rejects.toThrow(/not configured/);

    setEnv({ APP_ENV: "development", STORAGE_BUCKET: undefined, STORAGE_KEY: undefined, STORAGE_SECRET: undefined });
    const stored = await storeImage(await png(128), "avatar", owner);
    expect(stored.url).toMatch(new RegExp(`^/uploads/avatar/${owner}/`));
    const file = await readLocalUpload(stored.url.replace("/uploads/", ""));
    expect(file?.contentType).toBe("image/png");
    expect(await readLocalUpload(`avatar/${owner}/../../../../etc/passwd`)).toBeNull();
    expect(s3.puts).toHaveLength(0);
  });

  it("only lets each role upload the images it manages", async () => {
    const college = await makeCollege();
    const student = asSession(await makeUser("STUDENT", college.id));
    const organizer = asSession(await makeUser("EVENT_ORGANIZER", college.id));
    const admin = asSession(await makeUser("COLLEGE_ADMIN", college.id));
    const matrix = (u: typeof student) => (["avatar", "banner", "gallery", "logo", "signature"] as const).map((k) => canUpload(u, k));
    expect(matrix(student)).toEqual([true, false, false, false, false]);
    expect(matrix(organizer)).toEqual([true, true, true, false, false]);
    expect(matrix(admin)).toEqual([true, true, true, true, true]);
  });
});

const CRON_SECRET = "cron-secret-for-tests-0123456789";
const cronRequest = (auth?: string) => new Request("http://localhost/api/cron/x", { headers: auth === undefined ? {} : { authorization: auth } });

describe("cron endpoints", () => {
  const routes = { "event-status": eventStatusCron.GET, reminders: remindersCron.GET, cleanup: cleanupCron.GET };

  it("reject missing or wrong credentials", async () => {
    captureLogs();
    setEnv({ CRON_SECRET });
    for (const [name, GET] of Object.entries(routes)) {
      for (const auth of [undefined, "", "Bearer", `Bearer ${CRON_SECRET}x`, `bearer ${CRON_SECRET}`, CRON_SECRET, `Basic ${CRON_SECRET}`]) {
        expect((await GET(cronRequest(auth))).status, `${name} ${auth}`).toBe(401);
      }
    }
  });

  it("reject everything when CRON_SECRET is not configured", async () => {
    captureLogs();
    setEnv({ CRON_SECRET: undefined });
    for (const GET of Object.values(routes)) {
      for (const auth of [undefined, "Bearer ", "Bearer undefined"]) expect((await GET(cronRequest(auth))).status).toBe(401);
    }
  });

  it("run with the configured secret", async () => {
    captureLogs();
    setEnv({ CRON_SECRET });
    for (const [name, GET] of Object.entries(routes)) {
      const res = await GET(cronRequest(`Bearer ${CRON_SECRET}`));
      expect(res.status, name).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, job: name });
    }
  });

  it("are idempotent: repeated and concurrent runs send each notification once", async () => {
    captureLogs();
    setEnv({ CRON_SECRET });
    const auth = `Bearer ${CRON_SECRET}`;
    const college = await makeCollege();
    const org = await makeUser("EVENT_ORGANIZER", college.id);
    const student = await makeUser("STUDENT", college.id);

    // Reminders: an event starting in 20h gets its 24h reminder once.
    const upcoming = await makeEvent({ collegeId: college.id, organizerId: org.id, startsInH: 20, deadlineInH: 10 });
    await registerForEvent(asSession(student), { eventId: upcoming.id });
    await Promise.all([remindersCron.GET(cronRequest(auth)), remindersCron.GET(cronRequest(auth))]);
    await remindersCron.GET(cronRequest(auth));
    expect(await prisma.notification.count({ where: { userId: student.id, type: "EVENT_REMINDER" } })).toBe(1);

    // Status automation: a finished event is completed once and asks for feedback once.
    const ended = await makeEvent({ collegeId: college.id, organizerId: org.id, startsInH: 30 });
    await registerForEvent(asSession(student), { eventId: ended.id });
    await prisma.event.update({ where: { id: ended.id }, data: { startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H), registrationDeadline: new Date(Date.now() - 4 * H) } });
    const runs = await Promise.all([eventStatusCron.GET(cronRequest(auth)), eventStatusCron.GET(cronRequest(auth))]);
    const again = await eventStatusCron.GET(cronRequest(auth));
    const completed = (await Promise.all(runs.map((r) => r.json()))).reduce((n, b) => n + b.completed, 0);
    expect(completed).toBe(1);
    expect((await again.json()).completed).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ended.id } })).status).toBe("COMPLETED");
    expect(await prisma.notification.count({ where: { userId: student.id, type: "FEEDBACK_REQUEST" } })).toBe(1);
    // The feedback request is also emailed (recorded as SKIPPED here: no provider in tests).
    expect(await prisma.emailLog.count({ where: { template: "FEEDBACK_REQUEST", to: student.email } })).toBe(1);
  });
});

describe("Razorpay configuration guards", () => {
  it("refuses LIVE keys outside production, so no real charge can start from dev/staging", async () => {
    setEnv({ APP_ENV: "staging", RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456" });
    expect(razorpayConfigured()).toBe(false);
    const college = await makeCollege();
    const org = await makeUser("EVENT_ORGANIZER", college.id);
    const event = await makeEvent({ collegeId: college.id, organizerId: org.id, fee: 49900 });
    const student = await makeUser("STUDENT", college.id);
    await expect(registerForEvent(asSession(student), { eventId: event.id })).rejects.toMatchObject({ code: "PAYMENTS_NOT_CONFIGURED" });
    expect(await prisma.registration.count()).toBe(0);

    setEnv({ APP_ENV: "staging", RAZORPAY_KEY_ID: "rzp_test_AbCdEf123456" });
    expect(razorpayConfigured()).toBe(true);
  });

  it("requires the webhook secret in production and rejects webhooks without one", async () => {
    captureLogs();
    setEnv({ APP_ENV: "production", NEXT_PUBLIC_APP_URL: "https://events.college.test", RAZORPAY_KEY_ID: "rzp_live_AbCdEf123456", RAZORPAY_WEBHOOK_SECRET: undefined });
    expect(razorpayConfigured()).toBe(false);
    await expect(handleRazorpayWebhook("{}", "sig", "evt_1")).rejects.toBeInstanceOf(AppError);
    expect(await prisma.paymentWebhook.count()).toBe(0);
  });
});
