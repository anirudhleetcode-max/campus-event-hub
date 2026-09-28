import "server-only";
import { db } from "./db";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Fixed-window rate limiter backed by Postgres so limits hold across
 * serverless instances. Throws RATE_LIMITED when exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, expires_at)
    VALUES (${key}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at < (now() AT TIME ZONE 'UTC') THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at < (now() AT TIME ZONE 'UTC') THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
    RETURNING count`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    logger.warn("Rate limit exceeded", { key: key.replace(/:[^:]*@[^:]*/, ":[email]"), limit });
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.");
  }
}

/**
 * Gives back one unit of a window, e.g. after a SUCCESSFUL login, so the
 * per-account limit only accumulates failed attempts. Counting stays atomic
 * in rateLimit(), so parallel guesses can't slip past the limit.
 */
export async function refundRateLimit(key: string): Promise<void> {
  await db.$executeRaw`
    UPDATE rate_limits SET count = GREATEST(count - 1, 0)
    WHERE key = ${key} AND expires_at >= (now() AT TIME ZONE 'UTC')`;
}

export async function purgeExpiredRateLimits(): Promise<number> {
  const res = await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
