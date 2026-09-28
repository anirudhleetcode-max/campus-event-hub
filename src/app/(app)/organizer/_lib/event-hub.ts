import "server-only";
import type { Prisma } from "@prisma/client";
import { staffEventScope } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";

/** One page of the viewer's events (search + extra filter), newest first — used by the cross-event hubs. */
export async function scopedEventPage(user: SessionUser, opts: { q?: string; page: number; pageSize?: number; where?: Prisma.EventWhereInput }) {
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.EventWhereInput = {
    AND: [staffEventScope(user), opts.where ?? {}, opts.q ? { title: { contains: opts.q.slice(0, 100), mode: "insensitive" } } : {}],
  };
  const [total, items] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: { startsAt: "desc" },
      skip: (opts.page - 1) * pageSize,
      take: pageSize,
      select: { id: true, title: true, status: true, startsAt: true, endsAt: true, college: { select: { shortName: true, name: true } } },
    }),
  ]);
  return { items, total, page: opts.page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function countBy(model: "registration" | "attendance", eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows =
    model === "registration"
      ? await db.registration.groupBy({ by: ["eventId"], where: { eventId: { in: eventIds }, status: "CONFIRMED" }, _count: { _all: true } })
      : await db.attendance.groupBy({ by: ["eventId"], where: { eventId: { in: eventIds } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.eventId, r._count._all]));
}
