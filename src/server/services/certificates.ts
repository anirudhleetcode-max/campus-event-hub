import "server-only";
import type { CertificateType, Prisma } from "@prisma/client";
import { db } from "../db";
import { appUrl } from "../env";
import { AppError, notFound } from "../errors";
import { audit } from "../audit";
import { friendlyCode } from "../crypto";
import { notify } from "../notifications";
import { can, requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { renderCertificatePdf } from "../pdf/certificate";
import { issueCertificatesSchema } from "@/lib/validators";
import { CERTIFICATE_TYPE } from "@/lib/labels";
import { formatDate, formatDateRange } from "@/lib/utils";

const DEFAULT_BODY: Record<CertificateType, string> = {
  PARTICIPATION: "has successfully participated in {{event}} organised by {{college}} held on {{date}}.",
  WINNER: "has secured {{position}} in {{event}} organised by {{college}} held on {{date}}.",
  RUNNER_UP: "has been declared {{position}} in {{event}} organised by {{college}} held on {{date}}.",
  VOLUNTEER: "has served as a volunteer for {{event}} organised by {{college}} held on {{date}}, contributing to its success.",
  ORGANIZER: "has organised {{event}} at {{college}} held on {{date}} with dedication and excellence.",
  SPEAKER: "has delivered a session as a distinguished speaker at {{event}} organised by {{college}} on {{date}}.",
};

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

function newCode(): string {
  return `CEH-${new Date().getFullYear()}-${friendlyCode(8)}`;
}

/** Determine which users may receive a certificate of the given type for this event. */
async function eligibleUserIds(eventId: string, type: CertificateType, organizerId: string): Promise<Map<string, { name: string; registrationId?: string }>> {
  const map = new Map<string, { name: string; registrationId?: string }>();
  if (type === "PARTICIPATION" || type === "WINNER" || type === "RUNNER_UP") {
    const regs = await db.registration.findMany({
      where: { eventId, status: "CONFIRMED", attendance: { isNot: null } },
      select: { id: true, userId: true, participantName: true },
    });
    regs.forEach((r) => map.set(r.userId, { name: r.participantName, registrationId: r.id }));
  } else {
    const roles = type === "VOLUNTEER" ? ["VOLUNTEER"] : type === "ORGANIZER" ? ["CO_ORGANIZER", "FACULTY_COORDINATOR"] : ["VOLUNTEER", "CO_ORGANIZER", "FACULTY_COORDINATOR"];
    const staff = await db.eventVolunteer.findMany({
      where: { eventId, role: { in: roles as ("VOLUNTEER" | "CO_ORGANIZER" | "FACULTY_COORDINATOR")[] } },
      select: { userId: true, user: { select: { name: true } } },
    });
    staff.forEach((s) => map.set(s.userId, { name: s.user.name }));
    if (type === "ORGANIZER") {
      const org = await db.user.findUnique({ where: { id: organizerId }, select: { id: true, name: true } });
      if (org) map.set(org.id, { name: org.name });
    }
    if (type === "SPEAKER") {
      // Speakers with platform accounts are typically registered participants too.
      const regs = await db.registration.findMany({ where: { eventId, status: "CONFIRMED" }, select: { id: true, userId: true, participantName: true } });
      regs.forEach((r) => map.set(r.userId, { name: r.participantName, registrationId: r.id }));
    }
  }
  return map;
}

export async function issueCertificates(actor: SessionUser, raw: unknown) {
  const input = issueCertificatesSchema.parse(raw);
  const { event } = await requireEventAccess(actor, input.eventId, "canManage");
  const full = await db.event.findUniqueOrThrow({ where: { id: event.id }, select: { endsAt: true, startsAt: true, organizerId: true, title: true, status: true } });
  if (full.status === "CANCELLED") throw new AppError("CONFLICT", "Certificates can't be issued for a cancelled event.");
  if (full.startsAt > new Date()) throw new AppError("CONFLICT", "Certificates can be issued once the event has started.");
  if ((input.type === "WINNER" || input.type === "RUNNER_UP" || input.type === "SPEAKER") && !input.userIds?.length) {
    throw new AppError("VALIDATION", "Select the recipients for this certificate type.", { fieldErrors: { userIds: "Select at least one recipient" } });
  }

  const eligible = await eligibleUserIds(event.id, input.type, full.organizerId);
  const targets = input.userIds?.length ? input.userIds.filter((id) => eligible.has(id)) : [...eligible.keys()];
  const rejected = (input.userIds?.length ?? 0) - (input.userIds?.length ? targets.length : 0);
  if (targets.length === 0) {
    throw new AppError(
      "CONFLICT",
      input.type === "PARTICIPATION" ? "No checked-in participants are eligible for certificates yet." : "None of the selected people are eligible for this certificate type.",
    );
  }

  const template = await db.certificateTemplate.findFirst({
    where: { type: input.type, OR: [{ eventId: event.id }, { collegeId: event.collegeId, eventId: null }] },
    orderBy: [{ eventId: { sort: "desc", nulls: "last" } }, { isDefault: "desc" }],
    select: { id: true },
  });

  const existing = await db.certificate.findMany({ where: { eventId: event.id, type: input.type, userId: { in: targets } }, select: { userId: true } });
  const existingSet = new Set(existing.map((e) => e.userId));
  const fresh = targets.filter((id) => !existingSet.has(id));

  const rows: Prisma.CertificateCreateManyInput[] = fresh.map((userId) => ({
    code: newCode(),
    eventId: event.id,
    userId,
    registrationId: eligible.get(userId)?.registrationId,
    templateId: template?.id,
    type: input.type,
    recipientName: eligible.get(userId)!.name,
    position: input.position ?? (input.type === "WINNER" ? "First Place" : input.type === "RUNNER_UP" ? "Runner-up" : null),
    issuedById: actor.id,
  }));
  const created = rows.length ? await db.certificate.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };

  if (created.count > 0) {
    await notify(fresh, {
      type: "CERTIFICATE_AVAILABLE",
      title: `Your certificate for ${full.title} is ready`,
      body: `A ${CERTIFICATE_TYPE[input.type].toLowerCase()} certificate has been issued to you. Download it anytime from your dashboard.`,
      link: "/my/certificates",
      email: true,
      emailCta: "Download certificate",
    });
  }
  await audit({ actorId: actor.id, action: "certificate.issued", entityType: "event", entityId: event.id, metadata: { type: input.type, count: created.count } });
  return { issued: created.count, skippedExisting: existingSet.size, ineligible: rejected };
}

export async function revokeCertificate(actor: SessionUser, certificateId: string, reason: string) {
  const cert = await db.certificate.findUnique({ where: { id: certificateId } });
  if (!cert) throw notFound("Certificate");
  await requireEventAccess(actor, cert.eventId, "canManage");
  if (cert.status === "REVOKED") throw new AppError("CONFLICT", "This certificate is already revoked.");
  if (!reason.trim()) throw new AppError("VALIDATION", "Please provide a reason.", { fieldErrors: { reason: "Reason is required" } });
  await db.certificate.update({ where: { id: cert.id }, data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason } });
  await audit({ actorId: actor.id, action: "certificate.revoked", entityType: "certificate", entityId: cert.id, metadata: { reason } });
}

/** Public verification — exposes only what's printed on the certificate itself. */
export async function verifyCertificate(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^CEH-\d{4}-[2-9A-Z]{8}$/.test(normalized)) return null;
  const c = await db.certificate.findUnique({
    where: { code: normalized },
    select: {
      code: true, type: true, recipientName: true, position: true, status: true, issuedAt: true, revokedAt: true,
      event: { select: { title: true, startsAt: true, endsAt: true, slug: true, college: { select: { name: true, logoUrl: true } } } },
    },
  });
  if (!c) return null;
  return {
    code: c.code,
    valid: c.status === "ISSUED",
    status: c.status,
    type: c.type,
    typeLabel: CERTIFICATE_TYPE[c.type],
    recipientName: c.recipientName,
    position: c.position,
    issuedAt: c.issuedAt,
    revokedAt: c.revokedAt,
    event: { title: c.event.title, slug: c.event.slug, dates: formatDateRange(c.event.startsAt, c.event.endsAt) },
    issuer: { name: c.event.college.name, logoUrl: c.event.college.logoUrl },
  };
}

/** Owner, event staff and admins may download the PDF. */
export async function certificatePdf(actor: SessionUser, code: string): Promise<{ filename: string; bytes: Uint8Array }> {
  const c = await db.certificate.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      template: true,
      event: {
        select: {
          id: true, title: true, startsAt: true, endsAt: true, collegeId: true,
          category: { select: { color: true } },
          college: { select: { name: true, logoUrl: true, signatoryName: true, signatoryTitle: true, signatureUrl: true } },
        },
      },
    },
  });
  if (!c) throw notFound("Certificate");
  if (c.userId !== actor.id) {
    const isAdmin = can(actor, "platform:manage") || (actor.role === "COLLEGE_ADMIN" && actor.collegeId === c.event.collegeId);
    if (!isAdmin) await requireEventAccess(actor, c.eventId, "canView");
  }
  if (c.status !== "ISSUED") throw new AppError("CONFLICT", "This certificate has been revoked and is no longer available.");

  const date = formatDate(c.event.startsAt, { day: "numeric", month: "long", year: "numeric" });
  const vars = { name: c.recipientName, event: c.event.title, date, college: c.event.college.name, position: c.position ?? "" };
  const bytes = await renderCertificatePdf({
    code: c.code,
    typeLabel: CERTIFICATE_TYPE[c.type],
    heading: c.template?.heading ?? `Certificate of ${CERTIFICATE_TYPE[c.type]}`,
    recipientName: c.recipientName,
    body: fillTemplate(c.template?.body ?? DEFAULT_BODY[c.type], vars),
    eventTitle: c.event.title,
    collegeName: c.event.college.name,
    issuedOn: formatDate(c.issuedAt, { day: "numeric", month: "long", year: "numeric" }),
    verifyUrl: appUrl(`/verify/${c.code}`),
    accentColor: c.template?.accentColor ?? "#3b4fd8",
    collegeLogoUrl: c.event.college.logoUrl,
    eventLogoText: c.event.title.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join(""),
    eventColor: c.event.category.color,
    signatoryName: c.template?.signatoryName ?? c.event.college.signatoryName,
    signatoryTitle: c.template?.signatoryTitle ?? c.event.college.signatoryTitle,
    signatureUrl: c.event.college.signatureUrl,
  });
  const safeName = c.recipientName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "certificate";
  return { filename: `${c.code}-${safeName}.pdf`, bytes };
}

export async function listMyCertificates(actor: SessionUser) {
  return db.certificate.findMany({
    where: { userId: actor.id },
    orderBy: { issuedAt: "desc" },
    include: { event: { select: { title: true, slug: true, startsAt: true, college: { select: { name: true } }, category: { select: { color: true, name: true } } } } },
  });
}

export async function listEventCertificates(actor: SessionUser, eventId: string) {
  await requireEventAccess(actor, eventId, "canView");
  return db.certificate.findMany({
    where: { eventId },
    orderBy: { issuedAt: "desc" },
    include: { user: { select: { email: true } }, issuedBy: { select: { name: true } } },
  });
}
