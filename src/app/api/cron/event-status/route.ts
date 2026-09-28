import { runCron } from "@/server/cron";
import { syncEventStatuses } from "@/server/services/events";
import { expireStaleHolds } from "@/server/services/registrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Advances time-driven event statuses and expires abandoned seat holds. */
export function GET(req: Request) {
  return runCron(req, "event-status", async () => {
    const sync = await syncEventStatuses();
    const expired = await expireStaleHolds();
    return { statusUpdates: sync.updated, completed: sync.completed.length, expiredHolds: expired };
  });
}
