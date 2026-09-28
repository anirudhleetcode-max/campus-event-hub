import { runCron } from "@/server/cron";
import { db } from "@/server/db";
import { purgeExpiredRateLimits } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Housekeeping: expired sessions, reset tokens and rate-limit windows. */
export function GET(req: Request) {
  return runCron(req, "cleanup", async () => {
    const now = new Date();
    const [sessions, resets, limits] = await Promise.all([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
      purgeExpiredRateLimits(),
    ]);
    return { sessions: sessions.count, resetTokens: resets.count, rateLimits: limits };
  });
}
