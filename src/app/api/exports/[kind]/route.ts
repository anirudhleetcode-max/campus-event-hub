import { requireUser } from "@/server/auth/session";
import { csvResponse } from "@/server/csv";
import { errorResponse, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { AppError } from "@/server/errors";
import { EXPORT_KINDS, exportCsv, type ExportKind } from "@/server/services/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isKind(v: string): v is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(v);
}

/** CSV export: /api/exports/<kind>?eventId=…&range=…&from=…&to=… */
export async function GET(req: Request, ctx: RouteContext<"/api/exports/[kind]">) {
  try {
    const { kind } = await ctx.params;
    if (!isKind(kind)) return json({ error: "Unknown export type.", code: "NOT_FOUND" }, { status: 404 });
    const user = await requireUser();
    await rateLimit(`export:${user.id}`, 30, 60);

    const sp = new URL(req.url).searchParams;
    const eventId = sp.get("eventId") || undefined;
    if (eventId && !UUID_RE.test(eventId)) throw new AppError("VALIDATION", "Invalid event.");
    const from = sp.get("from") || undefined;
    const to = sp.get("to") || undefined;
    const range = sp.get("range")?.slice(0, 10) || undefined;
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) throw new AppError("VALIDATION", "Dates must be in YYYY-MM-DD format.");

    const csv = await exportCsv(user, kind, { eventId, range, from, to });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(`${kind}${eventId ? `-${eventId.slice(0, 8)}` : ""}-${stamp}.csv`, csv);
  } catch (err) {
    return errorResponse(err, { route: "exports" });
  }
}
