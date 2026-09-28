import { requireUser, type SessionUser } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { audit } from "@/server/audit";
import { csvResponse, toCsv } from "@/server/csv";
import { errorResponse, json } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { AppError } from "@/server/errors";
import { dashboardAnalytics, resolveRange } from "@/server/services/analytics";
import { EXPORT_KINDS, exportCsv, type ExportKind } from "@/server/services/exports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cross-event analytics for organizers / faculty. `exportCsv` only allows
 * college-wide exports for admins, but `dashboardAnalytics` is already scoped
 * to the events the user can see, so staff may export their own trends.
 */
async function scopedAnalyticsCsv(user: SessionUser, range?: string, from?: string, to?: string) {
  const a = await dashboardAnalytics(user, resolveRange(range, from, to));
  const rows = a.registrationTrend.map((r, i) => [r.date, r.value, ((a.revenueTrend[i]?.value ?? 0) / 100).toFixed(2), a.attendanceTrend[i]?.value ?? 0]);
  await audit({ actorId: user.id, action: "export.csv", entityType: "platform", metadata: { kind: "analytics", scope: "staff", rows: rows.length } });
  return toCsv(["Date", "Registrations", "Revenue (INR)", "Check-ins"], rows);
}

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

    const csv =
      kind === "analytics" && !eventId && !can(user, "payments:view-all")
        ? await scopedAnalyticsCsv(user, range, from, to)
        : await exportCsv(user, kind, { eventId, range, from, to });
    const stamp = new Date().toISOString().slice(0, 10);
    return csvResponse(`${kind}${eventId ? `-${eventId.slice(0, 8)}` : ""}-${stamp}.csv`, csv);
  } catch (err) {
    return errorResponse(err, { route: "exports" });
  }
}
