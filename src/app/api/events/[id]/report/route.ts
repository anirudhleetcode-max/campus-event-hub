import { requireUser } from "@/server/auth/session";
import { requireEventAccess } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { errorResponse } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { renderReportPdf } from "@/server/pdf/report";
import { eventAnalytics } from "@/server/services/analytics";
import { EVENT_MODE, EVENT_STATUS } from "@/lib/labels";
import { formatDateRange, formatDateTime, formatMoney, formatNumber, formatPercent } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Printable PDF summary report for one event. */
export async function GET(_req: Request, ctx: RouteContext<"/api/events/[id]/report">) {
  try {
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) throw new AppError("NOT_FOUND", "Event could not be found.");
    const user = await requireUser();
    await rateLimit(`report:${user.id}`, 20, 60);
    await requireEventAccess(user, id, "canView");

    const [a, event, staffCount] = await Promise.all([
      eventAnalytics(user, id),
      db.event.findUniqueOrThrow({
        where: { id },
        select: {
          title: true, slug: true, status: true, mode: true, startsAt: true, endsAt: true, registrationDeadline: true,
          venueName: true, city: true, feeAmount: true, currency: true,
          college: { select: { name: true } }, organizer: { select: { name: true } }, category: { select: { name: true } },
          department: { select: { name: true } },
        },
      }),
      db.eventVolunteer.count({ where: { eventId: id } }),
    ]);
    const money = (v: number) => (v === 0 ? "INR 0" : formatMoney(v, event.currency).replace("₹", "INR "));

    const pdf = await renderReportPdf(event.title, `${event.college.name} · ${formatDateRange(event.startsAt, event.endsAt)}`, [
      {
        title: "Event details",
        rows: [
          ["Status", EVENT_STATUS[event.status].label],
          ["Category", event.category.name],
          ["Department", event.department?.name ?? "—"],
          ["Organizer", event.organizer.name],
          ["Mode", EVENT_MODE[event.mode]],
          ["Venue", event.mode === "ONLINE" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", ") || "—"],
          ["Registration deadline", formatDateTime(event.registrationDeadline)],
          ["Registration fee", event.feeAmount ? money(event.feeAmount) : "Free"],
          ["Event staff", formatNumber(staffCount)],
        ],
      },
      {
        title: "Registrations",
        rows: [
          ["Capacity", formatNumber(a.capacity)],
          ["Confirmed registrations", formatNumber(a.registrations)],
          ["Fill rate", formatPercent(a.fillRate, 1)],
          ["Awaiting payment", formatNumber(a.pending)],
          ["Cancelled / expired / failed", formatNumber(a.cancelled)],
          ["Conversion rate", formatPercent(a.conversionRate, 1)],
        ],
      },
      {
        title: "Attendance",
        rows: [
          ["Checked in", formatNumber(a.attendance)],
          ["Attendance rate", formatPercent(a.attendanceRate, 1)],
          ["No-show rate", a.noShowRate === null ? "Event not started" : formatPercent(a.noShowRate, 1)],
        ],
      },
      {
        title: "Revenue",
        rows: [
          ["Successful payments", formatNumber(a.paidCount)],
          ["Net revenue", money(a.revenue)],
          ["Refunded", money(a.refunded)],
        ],
      },
      {
        title: "Outcomes",
        rows: [
          ["Certificates issued", formatNumber(a.certificates)],
          ["Feedback responses", formatNumber(a.feedbackCount)],
          ["Average rating", a.feedbackAvg === null ? "No ratings yet" : `${a.feedbackAvg.toFixed(2)} / 5`],
        ],
      },
    ]);

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="event-report-${event.slug.replace(/[^a-z0-9-]/g, "")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, { route: "events.report" });
  }
}
