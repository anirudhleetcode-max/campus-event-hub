import "server-only";
import { Prisma, type EventStatus } from "@prisma/client";
import { db, type Tx } from "../db";
import { AppError, forbidden, notFound } from "../errors";
import { audit } from "../audit";
import { friendlyCode } from "../crypto";
import { notify } from "../notifications";
import { publishEventStats } from "../realtime";
import { assertCan, requireEventAccess, staffEventScope } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { eventInputSchema, type EventFormValues } from "@/lib/validators";
import {
  EDITABLE_STATUSES,
  EVENT_ACTIONS,
  PUBLIC_STATUSES,
  canApplyAction,
  timeDrivenStatus,
  type EventAction,
} from "@/lib/event-status";
import { slugify } from "@/lib/utils";

// ─── Seat accounting ───────────────────────────────────────

/** Seats occupied = confirmed registrations + unexpired payment holds. */
export async function seatsTaken(eventId: string, client: Tx | typeof db = db, excludeRegistrationId?: string): Promise<number> {
  return client.registration.count({
    where: {
      eventId,
      ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
      OR: [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } }],
    },
  });
}

/** Seats taken for many events in one query. */
export async function seatsTakenMap(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db.registration.groupBy({
    by: ["eventId"],
    where: {
      eventId: { in: eventIds },
      OR: [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } }],
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.eventId, r._count._all]));
}

/** Serialises seat allocation for one event (row-level lock held until the transaction ends). */
export async function lockEvent(tx: Tx, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`;
}

// ─── Public discovery ──────────────────────────────────────

export type EventListFilters = {
  q?: string;
  category?: string;
  college?: string;
  department?: string;
  mode?: string;
  price?: "free" | "paid";
  from?: string;
  to?: string;
  when?: "upcoming" | "past" | "all";
  sort?: "soonest" | "newest" | "popular" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
};

const publicEventCard = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  bannerUrl: true,
  startsAt: true,
  endsAt: true,
  registrationOpensAt: true,
  registrationDeadline: true,
  venueName: true,
  city: true,
  mode: true,
  capacity: true,
  feeAmount: true,
  currency: true,
  status: true,
  category: { select: { name: true, slug: true, color: true } },
  college: { select: { name: true, shortName: true, slug: true } },
  department: { select: { name: true, code: true } },
} satisfies Prisma.EventSelect;

export type PublicEventCard = Prisma.EventGetPayload<{ select: typeof publicEventCard }> & { seatsTaken: number };

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function listPublicEvents(f: EventListFilters) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 12, 1), 48);
  const page = Math.max(f.page ?? 1, 1);
  const now = new Date();
  const q = f.q?.trim().slice(0, 100);

  const and: Prisma.EventWhereInput[] = [
    { deletedAt: null, status: { in: PUBLIC_STATUSES }, college: { status: "ACTIVE" } },
  ];
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { tags: { has: q.toLowerCase() } },
        { college: { name: { contains: q, mode: "insensitive" } } },
        { department: { name: { contains: q, mode: "insensitive" } } },
        { category: { name: { contains: q, mode: "insensitive" } } },
        { organizer: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.category) and.push({ category: { slug: f.category } });
  if (f.college) and.push({ college: { slug: f.college } });
  if (f.department) and.push({ departmentId: f.department });
  if (f.mode && ["IN_PERSON", "ONLINE", "HYBRID"].includes(f.mode)) and.push({ mode: f.mode as "IN_PERSON" });
  if (f.price === "free") and.push({ feeAmount: 0 });
  if (f.price === "paid") and.push({ feeAmount: { gt: 0 } });
  const from = parseDate(f.from);
  const to = parseDate(f.to);
  if (from) and.push({ startsAt: { gte: from } });
  if (to) and.push({ startsAt: { lte: new Date(to.getTime() + 86_399_999) } });
  const when = f.when ?? "upcoming";
  if (when === "upcoming") and.push({ endsAt: { gte: now }, status: { not: "CANCELLED" } });
  if (when === "past") and.push({ endsAt: { lt: now } });

  const orderBy: Prisma.EventOrderByWithRelationInput[] =
    f.sort === "newest"
      ? [{ publishedAt: "desc" }]
      : f.sort === "popular"
        ? [{ registrations: { _count: "desc" } }, { startsAt: "asc" }]
        : f.sort === "price_asc"
          ? [{ feeAmount: "asc" }, { startsAt: "asc" }]
          : f.sort === "price_desc"
            ? [{ feeAmount: "desc" }, { startsAt: "asc" }]
            : when === "past"
              ? [{ startsAt: "desc" }]
              : [{ startsAt: "asc" }];

  const where: Prisma.EventWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({ where, orderBy, select: publicEventCard, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const taken = await seatsTakenMap(rows.map((r) => r.id));
  const items: PublicEventCard[] = rows.map((r) => ({ ...r, seatsTaken: taken.get(r.id) ?? 0 }));
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getFilterOptions() {
  const [categories, colleges, departments] = await Promise.all([
    db.eventCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, color: true } }),
    db.college.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, shortName: true } }),
    db.department.findMany({
      where: { deletedAt: null, college: { status: "ACTIVE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, collegeId: true },
    }),
  ]);
  return { categories, colleges, departments };
}

export async function getPublicEventBySlug(slug: string) {
  const event = await db.event.findFirst({
    where: { slug, deletedAt: null, status: { in: PUBLIC_STATUSES } },
    include: {
      category: true,
      college: { select: { id: true, name: true, shortName: true, slug: true, logoUrl: true, city: true, status: true } },
      department: { select: { name: true, code: true } },
      organizer: { select: { id: true, name: true } },
      speakers: { orderBy: { position: "asc" } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  if (!event || event.college.status !== "ACTIVE") return null;
  return { ...event, seatsTaken: await seatsTaken(event.id) };
}

// ─── Staff: create / update ────────────────────────────────

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "event";
  for (let i = 0; i < 5; i++) {
    const slug = `${base}-${friendlyCode(5).toLowerCase()}`;
    const exists = await db.event.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  throw new AppError("INTERNAL", "Could not generate a unique event URL. Please try again.");
}

function toEventData(input: ReturnType<typeof eventInputSchema.parse>) {
  return {
    title: input.title,
    summary: input.summary,
    description: input.description,
    categoryId: input.categoryId,
    departmentId: input.departmentId ?? null,
    mode: input.mode,
    tags: input.tags.map((t) => t.toLowerCase()),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    registrationOpensAt: input.registrationOpensAt ?? null,
    registrationDeadline: input.registrationDeadline,
    schedule: input.schedule as Prisma.InputJsonValue,
    venueName: input.venueName ?? null,
    venueAddress: input.venueAddress ?? null,
    city: input.city ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    onlineUrl: input.onlineUrl ?? null,
    capacity: input.capacity,
    feeAmount: Math.round(input.fee * 100),
    eligibility: input.eligibility ?? null,
    requiredFields: input.requiredFields,
    bannerUrl: input.bannerUrl ?? null,
    galleryUrls: input.galleryUrls,
    rules: input.rules ?? null,
    terms: input.terms ?? null,
    refundPolicy: input.refundPolicy ?? null,
    faqs: input.faqs as Prisma.InputJsonValue,
  };
}

async function validateReferences(collegeId: string, input: { categoryId: string; departmentId?: string }) {
  const [category, department] = await Promise.all([
    db.eventCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }),
    input.departmentId
      ? db.department.findFirst({ where: { id: input.departmentId, collegeId, deletedAt: null }, select: { id: true } })
      : Promise.resolve({ id: "" }),
  ]);
  if (!category) throw new AppError("VALIDATION", "Please choose a valid category.", { fieldErrors: { categoryId: "Select a category" } });
  if (!department) throw new AppError("VALIDATION", "The department does not belong to this college.", { fieldErrors: { departmentId: "Select a valid department" } });
}

/** Save the event's venue into the college's reusable venue list. */
async function rememberVenue(tx: Tx, collegeId: string, input: { venueName?: string; venueAddress?: string; city?: string; latitude?: number; longitude?: number }) {
  if (!input.venueName) return null;
  const venue = await tx.venue.upsert({
    where: { collegeId_name: { collegeId, name: input.venueName } },
    create: { collegeId, name: input.venueName, address: input.venueAddress, city: input.city, latitude: input.latitude, longitude: input.longitude },
    update: { address: input.venueAddress, city: input.city, latitude: input.latitude, longitude: input.longitude },
    select: { id: true },
  });
  return venue.id;
}

export async function createEvent(actor: SessionUser, raw: EventFormValues, opts: { collegeId?: string } = {}) {
  assertCan(actor, "events:create", "Only organizers and administrators can create events.");
  const input = eventInputSchema.parse(raw);
  const collegeId = actor.role === "SUPER_ADMIN" ? (opts.collegeId ?? actor.collegeId) : actor.collegeId;
  if (!collegeId) throw new AppError("VALIDATION", "Select the college hosting this event.", { fieldErrors: { collegeId: "Select a college" } });
  await validateReferences(collegeId, input);

  const slug = await uniqueSlug(input.title);
  const event = await db.$transaction(async (tx) => {
    const venueId = await rememberVenue(tx, collegeId, input);
    return tx.event.create({
      data: {
        ...toEventData(input),
        slug,
        collegeId,
        organizerId: actor.id,
        venueId,
        status: "DRAFT",
        questions: { create: input.questions.map((q, i) => ({ label: q.label, type: q.type, options: q.options, required: q.required, position: i })) },
        speakers: { create: input.speakers.map((s, i) => ({ ...s, position: i })) },
      },
      select: { id: true, slug: true, title: true },
    });
  });
  await audit({ actorId: actor.id, action: "event.created", entityType: "event", entityId: event.id, metadata: { title: event.title } });
  return event;
}

export async function updateEvent(actor: SessionUser, eventId: string, raw: EventFormValues) {
  const { event } = await requireEventAccess(actor, eventId, "canManage");
  if (!EDITABLE_STATUSES.includes(event.status)) {
    throw new AppError("INVALID_TRANSITION", "Completed, cancelled or archived events can no longer be edited.");
  }
  const input = eventInputSchema.parse(raw);
  const current = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { collegeId: true, feeAmount: true, startsAt: true, endsAt: true, venueName: true, venueAddress: true, onlineUrl: true, title: true },
  });
  await validateReferences(current.collegeId, input);
  const data = toEventData(input);

  const [taken, confirmed] = await Promise.all([
    seatsTaken(eventId),
    db.registration.count({ where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } }),
  ]);
  if (data.capacity < taken) {
    throw new AppError("VALIDATION", `Capacity cannot be lower than the ${taken} seats already taken.`, {
      fieldErrors: { capacity: `At least ${taken} seats are already taken` },
    });
  }
  if (confirmed > 0 && data.feeAmount !== current.feeAmount) {
    throw new AppError("VALIDATION", "The registration fee cannot change once people have registered.", {
      fieldErrors: { fee: "Fee is locked because registrations exist" },
    });
  }

  await db.$transaction(async (tx) => {
    const venueId = await rememberVenue(tx, current.collegeId, input);
    await tx.event.update({ where: { id: eventId }, data: { ...data, venueId } });

    // Replace questions without destroying answers to questions that still exist.
    const keepIds = input.questions.map((q) => q.id).filter((id): id is string => Boolean(id));
    await tx.eventQuestion.deleteMany({ where: { eventId, id: { notIn: keepIds } } });
    for (const [i, q] of input.questions.entries()) {
      const fields = { label: q.label, type: q.type, options: q.options, required: q.required, position: i };
      if (q.id) await tx.eventQuestion.updateMany({ where: { id: q.id, eventId }, data: fields });
      else await tx.eventQuestion.create({ data: { ...fields, eventId } });
    }
    await tx.eventSpeaker.deleteMany({ where: { eventId } });
    if (input.speakers.length) {
      await tx.eventSpeaker.createMany({ data: input.speakers.map((s, i) => ({ ...s, eventId, position: i })) });
    }
  });

  const venueChanged = current.venueName !== (data.venueName ?? null) || current.venueAddress !== (data.venueAddress ?? null) || current.onlineUrl !== (data.onlineUrl ?? null);
  const timeChanged = current.startsAt.getTime() !== data.startsAt.getTime() || current.endsAt.getTime() !== data.endsAt.getTime();
  if ((venueChanged || timeChanged) && confirmed > 0) {
    const regs = await db.registration.findMany({ where: { eventId, status: "CONFIRMED" }, select: { userId: true } });
    await notify(
      regs.map((r) => r.userId),
      {
        type: venueChanged ? "VENUE_CHANGE" : "EVENT_UPDATE",
        title: venueChanged ? `Venue update: ${input.title}` : `Schedule update: ${input.title}`,
        body: venueChanged
          ? `The venue for ${input.title} has changed to ${data.venueName ?? "an online session"}. Please check the event page.`
          : `The timing for ${input.title} has changed. Please check the updated schedule.`,
        link: `/events/${event.slug}`,
        email: true,
        emailCta: "View event",
      },
    );
  }
  await publishEventStats(eventId);
  await audit({
    actorId: actor.id,
    action: "event.updated",
    entityType: "event",
    entityId: eventId,
    metadata: { venueChanged, timeChanged },
  });
  return { id: eventId, slug: event.slug };
}

export async function duplicateEvent(actor: SessionUser, eventId: string) {
  const { event } = await requireEventAccess(actor, eventId, "canManage");
  assertCan(actor, "events:create");
  const src = await db.event.findUniqueOrThrow({ where: { id: event.id }, include: { questions: true, speakers: true } });
  const slug = await uniqueSlug(src.title);
  const copy = await db.event.create({
    data: {
      slug,
      title: `${src.title} (copy)`.slice(0, 120),
      summary: src.summary,
      description: src.description,
      categoryId: src.categoryId,
      collegeId: src.collegeId,
      departmentId: src.departmentId,
      organizerId: actor.id,
      mode: src.mode,
      startsAt: src.startsAt,
      endsAt: src.endsAt,
      registrationOpensAt: src.registrationOpensAt,
      registrationDeadline: src.registrationDeadline,
      venueId: src.venueId,
      venueName: src.venueName,
      venueAddress: src.venueAddress,
      city: src.city,
      latitude: src.latitude,
      longitude: src.longitude,
      onlineUrl: src.onlineUrl,
      capacity: src.capacity,
      feeAmount: src.feeAmount,
      currency: src.currency,
      eligibility: src.eligibility,
      requiredFields: src.requiredFields,
      bannerUrl: src.bannerUrl,
      galleryUrls: src.galleryUrls,
      rules: src.rules,
      terms: src.terms,
      refundPolicy: src.refundPolicy,
      schedule: src.schedule as Prisma.InputJsonValue,
      faqs: src.faqs as Prisma.InputJsonValue,
      tags: src.tags,
      status: "DRAFT",
      questions: { create: src.questions.map((q) => ({ label: q.label, type: q.type, options: q.options, required: q.required, position: q.position })) },
      speakers: {
        create: src.speakers.map((s) => ({ name: s.name, title: s.title, organization: s.organization, bio: s.bio, photoUrl: s.photoUrl, role: s.role, position: s.position })),
      },
    },
    select: { id: true, slug: true },
  });
  await audit({ actorId: actor.id, action: "event.duplicated", entityType: "event", entityId: copy.id, metadata: { sourceId: eventId } });
  return copy;
}

// ─── Status transitions ────────────────────────────────────

export async function transitionEvent(actor: SessionUser, eventId: string, action: EventAction, opts: { reason?: string } = {}) {
  const { event, access } = await requireEventAccess(actor, eventId, "canManage");
  if (!canApplyAction(event.status, action)) {
    throw new AppError("INVALID_TRANSITION", `This event is ${event.status.toLowerCase().replace(/_/g, " ")} and cannot be moved to “${EVENT_ACTIONS[action].label.toLowerCase()}”.`);
  }
  const full = await db.event.findUniqueOrThrow({
    where: { id: eventId },
    select: {
      title: true, slug: true, collegeId: true, organizerId: true, startsAt: true, endsAt: true,
      registrationOpensAt: true, registrationDeadline: true, status: true,
      college: { select: { requireEventApproval: true } },
    },
  });

  if (action === "approve" || action === "reject") {
    if (!access.canApprove) throw forbidden("Only college administrators can review events.");
  }
  if (action === "publish" && full.college.requireEventApproval && !access.canApprove) {
    throw new AppError("FORBIDDEN", "Your college requires admin approval. Submit the event for approval instead.");
  }
  if ((action === "publish" || action === "approve" || action === "submit") && full.startsAt <= new Date()) {
    throw new AppError("VALIDATION", "The event start time is in the past. Update the schedule before publishing.");
  }
  if (action === "unpublish") {
    const active = await db.registration.count({ where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } });
    if (active > 0) throw new AppError("INVALID_TRANSITION", "Events with registrations can't be unpublished. Close registration or cancel the event instead.");
  }
  if (action === "openRegistration" && full.registrationDeadline <= new Date()) {
    throw new AppError("VALIDATION", "The registration deadline has passed. Extend the deadline before reopening registration.");
  }
  if (action === "cancel" && !opts.reason?.trim()) {
    throw new AppError("VALIDATION", "Please provide a reason for cancelling the event.", { fieldErrors: { reason: "Reason is required" } });
  }

  let to: EventStatus = EVENT_ACTIONS[action].to;
  // Publishing lands on the time-appropriate status (e.g. straight to REGISTRATION_OPEN).
  if (to === "PUBLISHED") to = timeDrivenStatus({ ...full, status: "PUBLISHED" });

  const updated = await db.event.updateMany({
    where: { id: eventId, status: event.status }, // optimistic concurrency guard
    data: {
      status: to,
      ...(to !== "DRAFT" && (action === "publish" || action === "approve") ? { publishedAt: new Date() } : {}),
      ...(action === "approve" ? { approvedById: actor.id, reviewNote: null } : {}),
      ...(action === "reject" ? { reviewNote: opts.reason ?? null } : {}),
      ...(action === "cancel" ? { cancelledAt: new Date(), cancelReason: opts.reason } : {}),
    },
  });
  if (updated.count === 0) throw new AppError("CONFLICT", "The event was changed by someone else. Refresh and try again.");

  await audit({ actorId: actor.id, action: `event.${action}`, entityType: "event", entityId: eventId, metadata: { from: event.status, to, reason: opts.reason } });
  await afterTransition(actor, eventId, full, action, opts.reason);
  await publishEventStats(eventId);
  return { status: to };
}

async function afterTransition(
  actor: SessionUser,
  eventId: string,
  e: { title: string; slug: string; collegeId: string; organizerId: string },
  action: EventAction,
  reason?: string,
) {
  if (action === "submit") {
    const admins = await db.user.findMany({ where: { collegeId: e.collegeId, role: "COLLEGE_ADMIN", status: "ACTIVE" }, select: { id: true } });
    await notify(admins.map((a) => a.id), {
      type: "EVENT_APPROVAL",
      title: "Event awaiting approval",
      body: `${actor.name} submitted “${e.title}” for approval.`,
      link: `/organizer/events/${eventId}`,
    });
  }
  if ((action === "approve" || action === "reject") && e.organizerId !== actor.id) {
    await notify([e.organizerId], {
      type: "EVENT_APPROVAL",
      title: action === "approve" ? "Your event was approved" : "Your event needs changes",
      body: action === "approve" ? `“${e.title}” is now live.` : `“${e.title}” was sent back to draft${reason ? `: ${reason}` : "."}`,
      link: `/organizer/events/${eventId}`,
    });
  }
  if (action === "cancel") {
    await cancelEventRegistrations(actor, eventId, e, reason ?? "");
  }
}

/** Cancels all active registrations of a cancelled event and queues refunds for paid ones. */
async function cancelEventRegistrations(actor: SessionUser, eventId: string, e: { title: string; slug: string }, reason: string) {
  const regs = await db.registration.findMany({
    where: { eventId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
    select: { id: true, userId: true },
  });
  if (regs.length === 0) return;
  await db.$transaction([
    db.registration.updateMany({
      where: { id: { in: regs.map((r) => r.id) } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Event cancelled", holdExpiresAt: null },
    }),
    db.payment.updateMany({
      where: { eventId, status: "CAPTURED", refundStatus: "NONE" },
      data: { refundStatus: "REQUESTED", refundReason: "Event cancelled" },
    }),
  ]);
  await notify(
    regs.map((r) => r.userId),
    {
      type: "EVENT_CANCELLED",
      title: `Event cancelled: ${e.title}`,
      body: `${e.title} has been cancelled. ${reason} Any payment you made will be refunded to the original payment method.`,
      link: `/events/${e.slug}`,
      email: true,
      emailCta: "View details",
    },
  );
  await audit({ actorId: actor.id, action: "registration.bulk_cancelled", entityType: "event", entityId: eventId, metadata: { count: regs.length } });
}

// ─── Staff listings ────────────────────────────────────────

export async function listStaffEvents(
  actor: SessionUser,
  f: { q?: string; status?: string; page?: number; pageSize?: number } = {},
) {
  const pageSize = Math.min(f.pageSize ?? 15, 100);
  const page = Math.max(f.page ?? 1, 1);
  const where: Prisma.EventWhereInput = {
    AND: [
      staffEventScope(actor),
      f.q ? { title: { contains: f.q.trim(), mode: "insensitive" } } : {},
      f.status && f.status !== "all" ? { status: f.status as EventStatus } : {},
    ],
  };
  const [total, events] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: [{ startsAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, slug: true, title: true, status: true, startsAt: true, endsAt: true, capacity: true, feeAmount: true,
        college: { select: { shortName: true, name: true } },
        organizer: { select: { name: true } },
        category: { select: { name: true, color: true } },
      },
    }),
  ]);
  const ids = events.map((e) => e.id);
  const [regs, att, rev] = await Promise.all([
    db.registration.groupBy({ by: ["eventId"], where: { eventId: { in: ids }, status: "CONFIRMED" }, _count: { _all: true } }),
    db.attendance.groupBy({ by: ["eventId"], where: { eventId: { in: ids } }, _count: { _all: true } }),
    db.payment.groupBy({
      by: ["eventId"],
      where: { eventId: { in: ids }, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      _sum: { amount: true, refundAmount: true },
    }),
  ]);
  const regMap = new Map(regs.map((r) => [r.eventId, r._count._all]));
  const attMap = new Map(att.map((r) => [r.eventId, r._count._all]));
  const revMap = new Map(rev.map((r) => [r.eventId, (r._sum.amount ?? 0) - (r._sum.refundAmount ?? 0)]));
  return {
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: events.map((e) => ({
      ...e,
      registrations: regMap.get(e.id) ?? 0,
      attendance: attMap.get(e.id) ?? 0,
      revenue: revMap.get(e.id) ?? 0,
    })),
  };
}

export async function getEventForStaff(actor: SessionUser, eventId: string) {
  const { access } = await requireEventAccess(actor, eventId, "canView").catch(async (err) => {
    // Volunteers may only reach the scanner.
    const res = await requireEventAccess(actor, eventId, "canScan").catch(() => {
      throw err;
    });
    return res;
  });
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: {
      category: true,
      college: { select: { id: true, name: true, shortName: true, requireEventApproval: true } },
      department: { select: { id: true, name: true } },
      organizer: { select: { id: true, name: true, email: true } },
      questions: { orderBy: { position: "asc" } },
      speakers: { orderBy: { position: "asc" } },
      volunteers: { include: { user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) throw notFound("Event");
  return { event, access };
}

// ─── Time-driven status sync (cron) ────────────────────────

export async function syncEventStatuses(now = new Date()): Promise<{ updated: number; completed: string[] }> {
  const candidates = await db.event.findMany({
    where: { deletedAt: null, status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"] } },
    select: { id: true, status: true, startsAt: true, endsAt: true, registrationOpensAt: true, registrationDeadline: true, title: true, slug: true },
  });
  let updated = 0;
  const completed: string[] = [];
  for (const e of candidates) {
    const next = timeDrivenStatus(e, now);
    if (next === e.status) continue;
    const res = await db.event.updateMany({ where: { id: e.id, status: e.status }, data: { status: next } });
    if (res.count === 0) continue;
    updated++;
    await audit({ actorId: null, action: "event.auto_status", entityType: "event", entityId: e.id, metadata: { from: e.status, to: next } });
    if (next === "COMPLETED") {
      completed.push(e.id);
      const attendees = await db.registration.findMany({ where: { eventId: e.id, status: "CONFIRMED" }, select: { userId: true } });
      await notify(attendees.map((a) => a.userId), {
        type: "FEEDBACK_REQUEST",
        title: `How was ${e.title}?`,
        body: "Share your feedback to help organizers make the next event even better.",
        link: `/my/registrations?feedback=${e.id}`,
      });
    }
    await publishEventStats(e.id);
  }
  return { updated, completed };
}
