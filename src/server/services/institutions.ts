import "server-only";
import type { CollegeStatus, Prisma, SubscriptionPlan } from "@prisma/client";
import { db } from "../db";
import { AppError, forbidden, notFound, isUniqueViolation } from "../errors";
import { audit } from "../audit";
import { destroyAllSessions, type SessionUser } from "../auth/session";
import { assertCan } from "../auth/permissions";
import { collegeSchema, departmentSchema } from "@/lib/validators";
import { slugify } from "@/lib/utils";
import { friendlyCode } from "../crypto";

export async function listColleges(actor: SessionUser, q?: string) {
  assertCan(actor, "college:profile");
  return db.college.findMany({
    where: {
      deletedAt: null,
      ...(actor.role === "SUPER_ADMIN" ? {} : { id: actor.collegeId ?? "" }),
      ...(q?.trim() ? { name: { contains: q.trim(), mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: { subscription: true, _count: { select: { users: true, events: true, departments: true } } },
  });
}

export async function getCollege(actor: SessionUser, id: string) {
  assertCan(actor, "college:profile");
  if (actor.role !== "SUPER_ADMIN" && actor.collegeId !== id) throw forbidden();
  const c = await db.college.findFirst({ where: { id, deletedAt: null }, include: { subscription: true } });
  if (!c) throw notFound("College");
  return c;
}

export async function listPublicColleges() {
  return db.college.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function saveCollege(actor: SessionUser, id: string | null, raw: unknown) {
  const input = collegeSchema.parse(raw);
  if (id === null) assertCan(actor, "colleges:manage");
  else {
    assertCan(actor, "college:profile");
    if (actor.role !== "SUPER_ADMIN" && actor.collegeId !== id) throw forbidden();
  }
  const data = {
    name: input.name, shortName: input.shortName ?? null, city: input.city ?? null, state: input.state ?? null,
    website: input.website ?? null, contactEmail: input.contactEmail ?? null, logoUrl: input.logoUrl ?? null,
    requireEventApproval: input.requireEventApproval, signatoryName: input.signatoryName ?? null, signatoryTitle: input.signatoryTitle ?? null,
  };
  const college = id
    ? await db.college.update({ where: { id }, data })
    : await db.college.create({
        data: { ...data, slug: `${slugify(input.shortName ?? input.name)}-${friendlyCode(4).toLowerCase()}`, subscription: { create: { plan: "FREE", status: "ACTIVE" } } },
      });
  await audit({ actorId: actor.id, action: id ? "college.updated" : "college.created", entityType: "college", entityId: college.id });
  return college;
}

export async function setCollegeStatus(actor: SessionUser, id: string, status: CollegeStatus) {
  assertCan(actor, "colleges:manage");
  await db.college.update({ where: { id }, data: { status } });
  if (status === "SUSPENDED") {
    const users = await db.user.findMany({ where: { collegeId: id }, select: { id: true } });
    for (const u of users) await destroyAllSessions(u.id);
  }
  await audit({ actorId: actor.id, action: status === "SUSPENDED" ? "college.suspended" : "college.activated", entityType: "college", entityId: id });
}

export async function updateSubscription(actor: SessionUser, collegeId: string, plan: SubscriptionPlan, status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED", eventLimit: number | null) {
  assertCan(actor, "platform:manage");
  await db.subscription.upsert({
    where: { collegeId },
    create: { collegeId, plan, status, eventLimit },
    update: { plan, status, eventLimit },
  });
  await audit({ actorId: actor.id, action: "subscription.updated", entityType: "college", entityId: collegeId, metadata: { plan, status, eventLimit } });
}

export async function listDepartments(actor: SessionUser, collegeId?: string) {
  assertCan(actor, "departments:manage");
  const cid = actor.role === "SUPER_ADMIN" ? collegeId : actor.collegeId;
  return db.department.findMany({
    where: { deletedAt: null, ...(cid ? { collegeId: cid } : {}) },
    orderBy: [{ college: { name: "asc" } }, { name: "asc" }],
    include: { college: { select: { name: true, shortName: true } }, _count: { select: { users: true, events: true } } },
  });
}

export async function publicDepartments(collegeId: string) {
  return db.department.findMany({ where: { collegeId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function saveDepartment(actor: SessionUser, id: string | null, raw: unknown) {
  assertCan(actor, "departments:manage");
  const input = departmentSchema.parse(raw);
  if (actor.role !== "SUPER_ADMIN" && input.collegeId !== actor.collegeId) throw forbidden();
  try {
    const dept = id
      ? await db.department.update({ where: { id, collegeId: input.collegeId }, data: { name: input.name, code: input.code } })
      : await db.department.create({ data: input });
    await audit({ actorId: actor.id, action: id ? "department.updated" : "department.created", entityType: "department", entityId: dept.id });
    return dept;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("CONFLICT", "A department with this code already exists.", { fieldErrors: { code: "Code already in use" } });
    throw err;
  }
}

export async function deleteDepartment(actor: SessionUser, id: string) {
  assertCan(actor, "departments:manage");
  const dept = await db.department.findFirst({ where: { id, deletedAt: null } });
  if (!dept) throw notFound("Department");
  if (actor.role !== "SUPER_ADMIN" && dept.collegeId !== actor.collegeId) throw forbidden();
  await db.department.update({ where: { id }, data: { deletedAt: new Date() } }); // soft delete keeps historical links
  await audit({ actorId: actor.id, action: "department.deleted", entityType: "department", entityId: id });
}

export async function listAuditLogs(actor: SessionUser, f: { q?: string; action?: string; entityType?: string; page?: number; pageSize?: number }) {
  assertCan(actor, "audit:view");
  const pageSize = Math.min(f.pageSize ?? 30, 100);
  const page = Math.max(f.page ?? 1, 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(actor.role === "SUPER_ADMIN" ? {} : { actor: { collegeId: actor.collegeId } }),
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.q?.trim() ? { OR: [{ actor: { name: { contains: f.q.trim(), mode: "insensitive" } } }, { entityId: f.q.trim() }, { action: { contains: f.q.trim() } }] } : {}),
  };
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { name: true, email: true, role: true } } },
    }),
  ]);
  return { total, items, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
