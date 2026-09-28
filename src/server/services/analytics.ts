import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { assertCan, requireEventAccess, staffEventScope } from "../auth/permissions";
import type { SessionUser } from "../auth/session";

const TZ = process.env.NEXT_PUBLIC_TIMEZONE ?? "Asia/Kolkata";

export type RangePreset = "today" | "7d" | "30d" | "90d" | "year" | "custom";
export type DateRange = { from: Date; to: Date; preset: RangePreset; bucket: "day" | "month" };

export function resolveRange(preset?: string, fromStr?: string, toStr?: string, now = new Date()): DateRange {
  const startOfDay = (d: Date) => {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return s;
  };
  let from: Date;
  let to = now;
  let p: RangePreset = (["today", "7d", "30d", "90d", "year", "custom"].includes(preset ?? "") ? preset : "30d") as RangePreset;
  if (p === "custom") {
    const f = fromStr ? new Date(fromStr) : null;
    const t = toStr ? new Date(toStr) : null;
    if (f && t && !Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
      from = startOfDay(f);
      to = new Date(startOfDay(t).getTime() + 86_399_999);
    } else {
      p = "30d";
      from = new Date(now.getTime() - 30 * 86_400_000);
    }
  } else if (p === "today") from = startOfDay(now);
  else if (p === "7d") from = new Date(now.getTime() - 7 * 86_400_000);
  else if (p === "90d") from = new Date(now.getTime() - 90 * 86_400_000);
  else if (p === "year") from = new Date(now.getFullYear(), 0, 1);
  else from = new Date(now.getTime() - 30 * 86_400_000);
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return { from, to, preset: p, bucket: days > 100 ? "month" : "day" };
}

async function scopedEventIds(actor: SessionUser): Promise<string[] | null> {
  if (actor.role === "SUPER_ADMIN") return null; // unrestricted
  const rows = await db.event.findMany({ where: staffEventScope(actor), select: { id: true } });
  return rows.map((r) => r.id);
}

function scopeSql(ids: string[] | null, column: string): Prisma.Sql {
  if (ids === null) return Prisma.sql`TRUE`;
  if (ids.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`${Prisma.raw(column)} = ANY(${ids}::uuid[])`;
}

/** Columns are UTC `timestamp without time zone`; convert parameters explicitly. */
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

type SeriesPoint = { date: string; value: number };

async function series(sql: Prisma.Sql): Promise<SeriesPoint[]> {
  const rows = await db.$queryRaw<{ bucket: Date; value: number | bigint | null }[]>(sql);
  return rows.map((r) => ({ date: r.bucket.toISOString().slice(0, 10), value: Number(r.value ?? 0) }));
}

function bucketSeries(range: DateRange, table: Prisma.Sql, tsColumn: string, valueExpr: Prisma.Sql, where: Prisma.Sql): Prisma.Sql {
  const unit = range.bucket;
  const step = unit === "month" ? Prisma.sql`'1 month'::interval` : Prisma.sql`'1 day'::interval`;
  const ts = Prisma.raw(tsColumn);
  return Prisma.sql`
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(${unit}, ${range.from.toISOString()}::timestamptz AT TIME ZONE ${TZ}),
        date_trunc(${unit}, ${range.to.toISOString()}::timestamptz AT TIME ZONE ${TZ}),
        ${step}
      ) AS bucket
    ), data AS (
      SELECT date_trunc(${unit}, (${ts} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS bucket, ${valueExpr} AS value
      FROM ${table}
      WHERE ${ts} BETWEEN ${utc(range.from)} AND ${utc(range.to)} AND ${where}
      GROUP BY 1
    )
    SELECT b.bucket, COALESCE(d.value, 0) AS value FROM buckets b LEFT JOIN data d USING (bucket) ORDER BY b.bucket`;
}

export async function dashboardAnalytics(actor: SessionUser, range: DateRange) {
  assertCan(actor, "analytics:view");
  const ids = await scopedEventIds(actor);
  const evScope = ids === null ? {} : { id: { in: ids } };
  const regScope = ids === null ? {} : { eventId: { in: ids } };
  const inRange = { gte: range.from, lte: range.to };
  const userScope = actor.role === "SUPER_ADMIN" ? {} : { collegeId: actor.collegeId ?? undefined };

  const [users, events, activeEvents, registrations, revenueAgg, attendance, certificates] = await Promise.all([
    db.user.count({ where: { deletedAt: null, ...userScope, createdAt: { lte: range.to } } }),
    db.event.count({ where: { ...evScope, deletedAt: null } }),
    db.event.count({ where: { ...evScope, deletedAt: null, status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"] } } }),
    db.registration.count({ where: { ...regScope, status: "CONFIRMED", confirmedAt: inRange } }),
    db.payment.aggregate({
      where: { ...regScope, status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] }, paidAt: inRange },
      _sum: { amount: true, refundAmount: true },
    }),
    db.attendance.count({ where: { ...regScope, checkInAt: inRange } }),
    db.certificate.count({ where: { ...regScope, status: "ISSUED", issuedAt: inRange } }),
  ]);

  const [registrationTrend, revenueTrend, attendanceTrend] = await Promise.all([
    series(bucketSeries(range, Prisma.sql`registrations`, "confirmed_at", Prisma.sql`COUNT(*)`, Prisma.sql`status = 'CONFIRMED' AND ${scopeSql(ids, "event_id")}`)),
    series(
      bucketSeries(
        range,
        Prisma.sql`payments`,
        "paid_at",
        Prisma.sql`SUM(amount - refund_amount)`,
        Prisma.sql`status IN ('CAPTURED','REFUNDED','PARTIALLY_REFUNDED') AND ${scopeSql(ids, "event_id")}`,
      ),
    ),
    series(bucketSeries(range, Prisma.sql`attendance`, "check_in_at", Prisma.sql`COUNT(*)`, scopeSql(ids, "event_id"))),
  ]);

  const [popular, departments, categories] = await Promise.all([
    db.$queryRaw<{ id: string; title: string; registrations: bigint; capacity: number }[]>`
      SELECT e.id, e.title, COUNT(r.id) AS registrations, e.capacity
      FROM events e JOIN registrations r ON r.event_id = e.id AND r.status = 'CONFIRMED' AND r.confirmed_at BETWEEN ${utc(range.from)} AND ${utc(range.to)}
      WHERE e.deleted_at IS NULL AND ${scopeSql(ids, "e.id")}
      GROUP BY e.id ORDER BY registrations DESC LIMIT 6`,
    db.$queryRaw<{ department: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(r.department_name, ''), 'Not specified') AS department, COUNT(*) AS count
      FROM registrations r
      WHERE r.status = 'CONFIRMED' AND r.confirmed_at BETWEEN ${utc(range.from)} AND ${utc(range.to)} AND ${scopeSql(ids, "r.event_id")}
      GROUP BY 1 ORDER BY count DESC LIMIT 8`,
    db.$queryRaw<{ category: string; color: string; count: bigint }[]>`
      SELECT c.name AS category, c.color, COUNT(r.id) AS count
      FROM registrations r JOIN events e ON e.id = r.event_id JOIN event_categories c ON c.id = e.category_id
      WHERE r.status = 'CONFIRMED' AND r.confirmed_at BETWEEN ${utc(range.from)} AND ${utc(range.to)} AND ${scopeSql(ids, "r.event_id")}
      GROUP BY c.name, c.color ORDER BY count DESC`,
  ]);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), preset: range.preset, bucket: range.bucket },
    totals: {
      users,
      events,
      activeEvents,
      registrations,
      revenue: (revenueAgg._sum.amount ?? 0) - (revenueAgg._sum.refundAmount ?? 0),
      attendance,
      certificates,
    },
    registrationTrend,
    revenueTrend,
    attendanceTrend,
    popularEvents: popular.map((p) => ({ id: p.id, title: p.title, registrations: Number(p.registrations), capacity: p.capacity })),
    departments: departments.map((d) => ({ name: d.department, value: Number(d.count) })),
    categories: categories.map((c) => ({ name: c.category, color: c.color, value: Number(c.count) })),
  };
}

export type DashboardAnalytics = Awaited<ReturnType<typeof dashboardAnalytics>>;

export async function eventAnalytics(actor: SessionUser, eventId: string) {
  const { event } = await requireEventAccess(actor, eventId, "canView");
  const ev = await db.event.findUniqueOrThrow({ where: { id: event.id }, select: { capacity: true, startsAt: true, endsAt: true, feeAmount: true, createdAt: true } });
  const [byStatus, revenue, attended, feedback, certificates] = await Promise.all([
    db.registration.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } }),
    db.payment.aggregate({ where: { eventId, status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] } }, _sum: { amount: true, refundAmount: true }, _count: { _all: true } }),
    db.attendance.count({ where: { eventId } }),
    db.feedback.aggregate({ where: { eventId }, _avg: { overall: true }, _count: { _all: true } }),
    db.certificate.count({ where: { eventId, status: "ISSUED" } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const confirmed = count("CONFIRMED");
  const attempts = byStatus.reduce((a, b) => a + b._count._all, 0);
  const started = ev.startsAt <= new Date();

  const range: DateRange = {
    from: new Date(Math.min(ev.createdAt.getTime(), ev.startsAt.getTime() - 30 * 86_400_000)),
    to: new Date(Math.min(Date.now(), ev.endsAt.getTime())),
    preset: "custom",
    bucket: "day",
  };
  if (range.to < range.from) range.to = range.from;
  const [timeline, checkins] = await Promise.all([
    series(bucketSeries(range, Prisma.sql`registrations`, "confirmed_at", Prisma.sql`COUNT(*)`, Prisma.sql`status = 'CONFIRMED' AND event_id = ${eventId}::uuid`)),
    db.$queryRaw<{ hour: Date; count: bigint }[]>`
      SELECT date_trunc('hour', (check_in_at AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}) AS hour, COUNT(*) AS count
      FROM attendance WHERE event_id = ${eventId}::uuid GROUP BY 1 ORDER BY 1`,
  ]);
  let cumulative = 0;
  return {
    capacity: ev.capacity,
    registrations: confirmed,
    pending: count("PENDING_PAYMENT"),
    cancelled: count("CANCELLED") + count("EXPIRED") + count("FAILED"),
    attempts,
    revenue: (revenue._sum.amount ?? 0) - (revenue._sum.refundAmount ?? 0),
    refunded: revenue._sum.refundAmount ?? 0,
    paidCount: revenue._count._all,
    attendance: attended,
    fillRate: ev.capacity ? confirmed / ev.capacity : 0,
    conversionRate: attempts ? confirmed / attempts : 0,
    noShowRate: started && confirmed ? Math.max(0, confirmed - attended) / confirmed : null,
    attendanceRate: confirmed ? attended / confirmed : 0,
    feedbackAvg: feedback._avg.overall,
    feedbackCount: feedback._count._all,
    certificates,
    timeline: timeline.map((p) => ({ date: p.date, value: p.value, cumulative: (cumulative += p.value) })),
    checkinsByHour: checkins.map((c) => ({ hour: c.hour.toISOString(), value: Number(c.count) })),
  };
}

export type EventAnalytics = Awaited<ReturnType<typeof eventAnalytics>>;

/** Lightweight counters for the organizer dashboard header cards. */
export async function organizerOverview(actor: SessionUser) {
  const scope = staffEventScope(actor);
  const events = await db.event.findMany({ where: scope, select: { id: true, status: true } });
  const ids = events.map((e) => e.id);
  const [registrations, revenue, attendance, certificates] = await Promise.all([
    db.registration.count({ where: { eventId: { in: ids }, status: "CONFIRMED" } }),
    db.payment.aggregate({ where: { eventId: { in: ids }, status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] } }, _sum: { amount: true, refundAmount: true } }),
    db.attendance.count({ where: { eventId: { in: ids } } }),
    db.certificate.count({ where: { eventId: { in: ids }, status: "ISSUED" } }),
  ]);
  return {
    totalEvents: events.length,
    activeEvents: events.filter((e) => ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"].includes(e.status)).length,
    pendingApproval: events.filter((e) => e.status === "PENDING_APPROVAL").length,
    registrations,
    revenue: (revenue._sum.amount ?? 0) - (revenue._sum.refundAmount ?? 0),
    attendance,
    certificates,
  };
}
