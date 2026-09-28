import "server-only";
import { env } from "./env";
import { safeEqual } from "./crypto";
import { json } from "./http";
import { logger } from "./logger";

/**
 * Wraps a cron job endpoint. Requires `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends this automatically when CRON_SECRET is set).
 */
export async function runCron(req: Request, name: string, job: () => Promise<Record<string, unknown>>) {
  const secret = env().CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    logger.warn("Unauthorised cron invocation", { job: name });
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const result = await job();
    logger.info("Cron job completed", { job: name, ms: Date.now() - started, ...result });
    return json({ ok: true, job: name, ...result });
  } catch (err) {
    logger.error("Cron job failed", { job: name, error: err });
    return json({ ok: false, job: name }, { status: 500 });
  }
}
