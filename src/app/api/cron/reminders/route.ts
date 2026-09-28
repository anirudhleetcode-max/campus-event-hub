import { runCron } from "@/server/cron";
import { sendDueReminders } from "@/server/services/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends configurable pre-event reminders (idempotent). */
export function GET(req: Request) {
  return runCron(req, "reminders", () => sendDueReminders());
}
