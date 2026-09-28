import "server-only";
import type { Prisma, Role, UserStatus } from "@prisma/client";
import { db } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { hashPassword } from "../auth/password";
import { destroyAllSessions, type SessionUser } from "../auth/session";
import { assertCan, assignableRoles, collegeScope, requireEventAccess } from "../auth/permissions";
import { createUserSchema, profileSchema } from "@/lib/validators";

export async function getProfile(actor: SessionUser) {
  return db.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: {
      id: true, name: true, email: true, phone: true, avatarUrl: true, role: true, year: true, studentId: true, interests: true,
      createdAt: true, collegeId: true, departmentId: true,
      college: { select: { name: true } }, department: { select: { name: true } },
    },
  });
}

export async function updateProfile(actor: SessionUser, raw: unknown) {
  const input = profileSchema.parse(raw);
  if (input.departmentId) {
    const dept = await db.department.findFirst({ where: { id: input.departmentId, collegeId: actor.collegeId ?? undefined, deletedAt: null } });
    if (!dept) throw new AppError("VALIDATION", "Select a department from your college.", { fieldErrors: { departmentId: "Invalid department" } });
  }
  await db.user.update({
    where: { id: actor.id },
    data: {
      name: input.name,
      phone: input.phone ?? null,
      departmentId: input.departmentId ?? null,
      year: input.year ?? null,
      studentId: input.studentId ?? null,
      interests: input.interests.map((i) => i.toLowerCase()),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    },
  });
  await audit({ actorId: actor.id, action: "user.profile_updated", entityType: "user", entityId: actor.id });
}

export async function listUsers(actor: SessionUser, f: { q?: string; role?: string; status?: string; collegeId?: string; page?: number; pageSize?: number }) {
  assertCan(actor, "users:manage");
  const pageSize = Math.min(f.pageSize ?? 20, 100);
  const page = Math.max(f.page ?? 1, 1);
  const scope = collegeScope(actor);
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...scope,
    ...(actor.role === "SUPER_ADMIN" && f.collegeId ? { collegeId: f.collegeId } : {}),
    ...(f.role && f.role !== "all" ? { role: f.role as Role } : {}),
    ...(f.status && f.status !== "all" ? { status: f.status as UserStatus } : {}),
    ...(f.q?.trim()
      ? { OR: [{ name: { contains: f.q.trim(), mode: "insensitive" } }, { email: { contains: f.q.trim(), mode: "insensitive" } }, { studentId: { contains: f.q.trim(), mode: "insensitive" } }] }
      : {}),
  };
  const [total, items] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, email: true, role: true, status: true, createdAt: true, lastLoginAt: true, studentId: true,
        college: { select: { name: true, shortName: true } }, department: { select: { name: true } },
        _count: { select: { registrations: true, organizedEvents: true } },
      },
    }),
  ]);
  return { total, items, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

async function loadManageableUser(actor: SessionUser, userId: string) {
  assertCan(actor, "users:manage");
  const target = await db.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, role: true, status: true, collegeId: true, name: true } });
  if (!target) throw notFound("User");
  if (target.id === actor.id) throw new AppError("FORBIDDEN", "You can't change your own account from here.");
  if (actor.role === "COLLEGE_ADMIN") {
    if (target.collegeId !== actor.collegeId) throw forbidden();
    if (target.role === "SUPER_ADMIN" || target.role === "COLLEGE_ADMIN") throw forbidden("Only platform administrators can manage college administrators.");
  }
  return target;
}

export async function setUserStatus(actor: SessionUser, userId: string, status: UserStatus, meta: { ip?: string } = {}) {
  const target = await loadManageableUser(actor, userId);
  if (target.status === status) return;
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status !== "ACTIVE") await destroyAllSessions(userId);
  await audit({ actorId: actor.id, action: status === "ACTIVE" ? "user.activated" : "user.suspended", entityType: "user", entityId: userId, metadata: { from: target.status, to: status }, ipAddress: meta.ip });
}

export async function changeUserRole(actor: SessionUser, userId: string, role: Role, meta: { ip?: string } = {}) {
  const target = await loadManageableUser(actor, userId);
  if (!assignableRoles(actor).includes(role)) throw forbidden("You can't assign this role.");
  if (target.role === role) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  await destroyAllSessions(userId); // force re-login with new permissions
  await audit({ actorId: actor.id, action: "user.role_changed", entityType: "user", entityId: userId, metadata: { from: target.role, to: role }, ipAddress: meta.ip });
}

export async function createUser(actor: SessionUser, raw: unknown) {
  assertCan(actor, "users:manage");
  const input = createUserSchema.parse(raw);
  if (!assignableRoles(actor).includes(input.role)) throw forbidden("You can't create users with this role.");
  const collegeId = actor.role === "SUPER_ADMIN" ? input.collegeId : actor.collegeId;
  if (input.role !== "SUPER_ADMIN" && !collegeId) throw new AppError("VALIDATION", "Select a college.", { fieldErrors: { collegeId: "Select a college" } });
  if (input.departmentId) {
    const d = await db.department.findFirst({ where: { id: input.departmentId, collegeId: collegeId ?? undefined } });
    if (!d) throw new AppError("VALIDATION", "Invalid department.", { fieldErrors: { departmentId: "Invalid department" } });
  }
  if (await db.user.findUnique({ where: { email: input.email } })) {
    throw new AppError("CONFLICT", "A user with this email already exists.", { fieldErrors: { email: "Email already in use" } });
  }
  const user = await db.user.create({
    data: {
      name: input.name, email: input.email, role: input.role, collegeId: input.role === "SUPER_ADMIN" ? null : collegeId,
      departmentId: input.departmentId, passwordHash: await hashPassword(input.password),
    },
    select: { id: true },
  });
  await audit({ actorId: actor.id, action: "user.created", entityType: "user", entityId: user.id, metadata: { role: input.role } });
  return user;
}

export async function getUserActivity(actor: SessionUser, userId: string) {
  assertCan(actor, "users:manage");
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null, ...collegeScope(actor) },
    select: {
      id: true, name: true, email: true, role: true, status: true, phone: true, studentId: true, year: true, createdAt: true, lastLoginAt: true,
      college: { select: { name: true } }, department: { select: { name: true } },
      registrations: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, code: true, status: true, createdAt: true, event: { select: { title: true } } } },
      organizedEvents: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, status: true } },
    },
  });
  if (!user) throw notFound("User");
  const logs = await db.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return { user, logs };
}

// ─── Event staff (volunteers, co-organizers, faculty) ──────

export async function addEventStaff(actor: SessionUser, eventId: string, email: string, role: "VOLUNTEER" | "CO_ORGANIZER" | "FACULTY_COORDINATOR", canScan: boolean) {
  const { event } = await requireEventAccess(actor, eventId, "canManage");
  const user = await db.user.findFirst({ where: { email: email.trim().toLowerCase(), deletedAt: null, status: "ACTIVE" }, select: { id: true, role: true, collegeId: true, name: true } });
  if (!user) throw new AppError("VALIDATION", "No active user found with that email.", { fieldErrors: { email: "User not found" } });
  if (user.collegeId !== event.collegeId && user.role !== "SUPER_ADMIN") throw new AppError("VALIDATION", "Staff must belong to the event's college.", { fieldErrors: { email: "User is from another college" } });
  if (role === "FACULTY_COORDINATOR" && user.role !== "FACULTY_COORDINATOR") throw new AppError("VALIDATION", "This user doesn't have a faculty coordinator account.", { fieldErrors: { email: "Not a faculty coordinator" } });
  if (role === "CO_ORGANIZER" && !["EVENT_ORGANIZER", "COLLEGE_ADMIN"].includes(user.role)) throw new AppError("VALIDATION", "Co-organizers must have an organizer account.", { fieldErrors: { email: "Not an organizer" } });
  await db.eventVolunteer.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    create: { eventId, userId: user.id, role, canScan },
    update: { role, canScan },
  });
  await audit({ actorId: actor.id, action: "event.staff_added", entityType: "event", entityId: eventId, metadata: { userId: user.id, role } });
  return user;
}

export async function removeEventStaff(actor: SessionUser, eventId: string, userId: string) {
  await requireEventAccess(actor, eventId, "canManage");
  await db.eventVolunteer.deleteMany({ where: { eventId, userId } });
  await audit({ actorId: actor.id, action: "event.staff_removed", entityType: "event", entityId: eventId, metadata: { userId } });
}
