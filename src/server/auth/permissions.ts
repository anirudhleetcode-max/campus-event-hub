import "server-only";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import type { SessionUser } from "./session";

/**
 * Role → capability map. This is the single source of truth for coarse
 * permissions; resource-level checks (e.g. "is this *my* event") live in the
 * access helpers below. Every server action / route handler calls these —
 * UI hiding is only a convenience.
 */
export const PERMISSIONS = {
  "platform:manage": ["SUPER_ADMIN"],
  "colleges:manage": ["SUPER_ADMIN"],
  "college:profile": ["SUPER_ADMIN", "COLLEGE_ADMIN"],
  "departments:manage": ["SUPER_ADMIN", "COLLEGE_ADMIN"],
  "users:manage": ["SUPER_ADMIN", "COLLEGE_ADMIN"],
  "events:create": ["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER"],
  "events:approve": ["SUPER_ADMIN", "COLLEGE_ADMIN"],
  "events:staff-area": ["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER", "FACULTY_COORDINATOR"],
  "payments:view-all": ["SUPER_ADMIN", "COLLEGE_ADMIN"],
  "analytics:view": ["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER", "FACULTY_COORDINATOR"],
  "audit:view": ["SUPER_ADMIN", "COLLEGE_ADMIN"],
  "announcements:send": ["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER"],
  "settings:manage": ["SUPER_ADMIN"],
  "events:register": ["STUDENT"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(user: Pick<SessionUser, "role"> | null | undefined, permission: Permission): boolean {
  return !!user && (PERMISSIONS[permission] as readonly Role[]).includes(user.role);
}

export function assertCan(user: SessionUser, permission: Permission, message?: string): void {
  if (!can(user, permission)) throw forbidden(message);
}

/** Which roles a given actor may assign to other users. */
export function assignableRoles(actor: Pick<SessionUser, "role">): Role[] {
  if (actor.role === "SUPER_ADMIN") return ["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER", "FACULTY_COORDINATOR", "STUDENT"];
  if (actor.role === "COLLEGE_ADMIN") return ["EVENT_ORGANIZER", "FACULTY_COORDINATOR", "STUDENT"];
  return [];
}

export type EventAccess = {
  canView: boolean; // staff read access: registrations, attendance, reports
  canManage: boolean; // edit, publish, refund, certificates, notifications
  canScan: boolean; // QR check-in
  canApprove: boolean; // approve pending events
};

type EventRef = { id: string; collegeId: string; organizerId: string };

/** Pure access computation (unit-tested). */
export function computeEventAccess(
  user: Pick<SessionUser, "id" | "role" | "collegeId">,
  event: Pick<EventRef, "collegeId" | "organizerId">,
  staffRole: "VOLUNTEER" | "CO_ORGANIZER" | "FACULTY_COORDINATOR" | null,
  staffCanScan = false,
): EventAccess {
  const none: EventAccess = { canView: false, canManage: false, canScan: false, canApprove: false };
  if (user.role === "SUPER_ADMIN") return { canView: true, canManage: true, canScan: true, canApprove: true };
  if (user.role === "COLLEGE_ADMIN") {
    return user.collegeId === event.collegeId ? { canView: true, canManage: true, canScan: true, canApprove: true } : none;
  }
  if (user.role === "EVENT_ORGANIZER" && event.organizerId === user.id) {
    return { canView: true, canManage: true, canScan: true, canApprove: false };
  }
  if (staffRole === "CO_ORGANIZER") return { canView: true, canManage: true, canScan: true, canApprove: false };
  if (staffRole === "FACULTY_COORDINATOR") return { canView: true, canManage: false, canScan: staffCanScan, canApprove: false };
  if (staffRole === "VOLUNTEER") return { ...none, canScan: staffCanScan };
  return none;
}

export async function getEventAccess(user: SessionUser, eventId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, collegeId: true, organizerId: true, status: true, title: true, slug: true },
  });
  if (!event) throw notFound("Event");
  const staff = await db.eventVolunteer.findUnique({
    where: { eventId_userId: { eventId, userId: user.id } },
    select: { role: true, canScan: true },
  });
  return { event, access: computeEventAccess(user, event, staff?.role ?? null, staff?.canScan ?? false) };
}

export async function requireEventAccess(user: SessionUser, eventId: string, need: keyof EventAccess) {
  const result = await getEventAccess(user, eventId);
  if (!result.access[need]) {
    throw new AppError("FORBIDDEN", "You don't have permission to manage this event.");
  }
  return result;
}

/**
 * Prisma `where` fragment restricting events to those the user can see in
 * staff views (organizer/admin dashboards).
 */
export function staffEventScope(user: SessionUser) {
  switch (user.role) {
    case "SUPER_ADMIN":
      return { deletedAt: null };
    case "COLLEGE_ADMIN":
      return { deletedAt: null, collegeId: user.collegeId ?? "00000000-0000-0000-0000-000000000000" };
    case "EVENT_ORGANIZER":
      return {
        deletedAt: null,
        OR: [
          { organizerId: user.id },
          { volunteers: { some: { userId: user.id, role: "CO_ORGANIZER" as const } } },
        ],
      };
    case "FACULTY_COORDINATOR":
      return { deletedAt: null, volunteers: { some: { userId: user.id, role: "FACULTY_COORDINATOR" as const } } };
    default:
      return { id: "00000000-0000-0000-0000-000000000000" };
  }
}

/** College scope for admin listings (users, payments, …). */
export function collegeScope(user: SessionUser): { collegeId?: string } {
  if (user.role === "SUPER_ADMIN") return {};
  if (!user.collegeId) throw forbidden();
  return { collegeId: user.collegeId };
}
