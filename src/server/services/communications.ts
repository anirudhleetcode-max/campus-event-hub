import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { AppError, forbidden } from "../errors";
import { audit } from "../audit";
import { notify, pushUnreadCount } from "../notifications";
import { can, requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { announcementSchema } from "@/lib/validators";

export async function listNotifications(actor: SessionUser, f: { filter?: "all" | "unread"; take?: number } = {}) {
  const where = { userId: actor.id, ...(f.filter === "unread" ? { readAt: null } : {}) };
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(f.take ?? 50, 200) }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { items, unread };
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationsRead(actor: SessionUser, ids: string[] | "all") {
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  await pushUnreadCount(actor.id);
}

/** Admin/organizer announcements → in-app notifications (+ optional email). */
export async function sendAnnouncement(actor: SessionUser, raw: unknown) {
  if (!can(actor, "announcements:send")) throw forbidden();
  const input = announcementSchema.parse(raw);
  let recipients: string[] = [];
  let collegeId: string | null = null;

  if (input.audience === "EVENT_PARTICIPANTS") {
    if (!input.eventId) throw new AppError("VALIDATION", "Choose an event.", { fieldErrors: { eventId: "Select an event" } });
    const { event } = await requireEventAccess(actor, input.eventId, "canManage");
    collegeId = event.collegeId;
    const regs = await db.registration.findMany({ where: { eventId: input.eventId, status: "CONFIRMED" }, select: { userId: true } });
    recipients = regs.map((r) => r.userId);
  } else {
    if (actor.role === "EVENT_ORGANIZER") throw forbidden("Organizers can only message their event participants.");
    collegeId = actor.role === "SUPER_ADMIN" ? (input.collegeId ?? null) : actor.collegeId;
    const where: Prisma.UserWhereInput = {
      status: "ACTIVE",
      deletedAt: null,
      ...(collegeId ? { collegeId } : {}),
      ...(input.audience === "ALL_STUDENTS" ? { role: "STUDENT" } : {}),
      ...(input.audience === "STAFF" ? { role: { in: ["COLLEGE_ADMIN", "EVENT_ORGANIZER", "FACULTY_COORDINATOR"] } } : {}),
    };
    recipients = (await db.user.findMany({ where, select: { id: true } })).map((u) => u.id);
  }
  if (recipients.length === 0) throw new AppError("CONFLICT", "There is nobody in this audience yet.");

  const event = input.eventId ? await db.event.findUnique({ where: { id: input.eventId }, select: { slug: true } }) : null;
  const count = await notify(recipients, {
    type: "ANNOUNCEMENT",
    title: input.title,
    body: input.body,
    link: event ? `/events/${event.slug}` : "/notifications",
    email: input.sendEmail,
  });
  const ann = await db.announcement.create({
    data: { authorId: actor.id, collegeId, eventId: input.eventId, title: input.title, body: input.body, audience: input.audience, recipientCount: count },
  });
  await audit({ actorId: actor.id, action: "announcement.sent", entityType: "announcement", entityId: ann.id, metadata: { audience: input.audience, count } });
  return { recipients: count };
}

export async function listAnnouncements(actor: SessionUser) {
  if (!can(actor, "announcements:send")) throw forbidden();
  return db.announcement.findMany({
    where:
      actor.role === "SUPER_ADMIN"
        ? {}
        : actor.role === "COLLEGE_ADMIN"
          ? { collegeId: actor.collegeId }
          : { authorId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { author: { select: { name: true } }, event: { select: { title: true } } },
  });
}
