import "server-only";
import { db } from "../db";
import { AppError, isUniqueViolation } from "../errors";
import { audit } from "../audit";
import { requireEventAccess } from "../auth/permissions";
import type { SessionUser } from "../auth/session";
import { feedbackSchema } from "@/lib/validators";

export async function feedbackEligibility(userId: string, eventId: string) {
  const reg = await db.registration.findUnique({
    where: { eventId_userId: { eventId, userId } },
    include: { event: { select: { status: true, endsAt: true, title: true } }, feedback: { select: { id: true } } },
  });
  if (!reg || reg.status !== "CONFIRMED") return { eligible: false as const, reason: "Only confirmed participants can leave feedback." };
  if (reg.feedback) return { eligible: false as const, reason: "You've already submitted feedback for this event." };
  if (reg.event.status !== "COMPLETED" && reg.event.endsAt > new Date()) {
    return { eligible: false as const, reason: "Feedback opens once the event has ended." };
  }
  return { eligible: true as const, registrationId: reg.id, eventTitle: reg.event.title };
}

export async function submitFeedback(actor: SessionUser, raw: unknown) {
  const input = feedbackSchema.parse(raw);
  const elig = await feedbackEligibility(actor.id, input.eventId);
  if (!elig.eligible) throw new AppError("CONFLICT", elig.reason);
  try {
    const fb = await db.feedback.create({
      data: {
        eventId: input.eventId,
        userId: actor.id,
        registrationId: elig.registrationId,
        overall: input.overall,
        organization: input.organization,
        venue: input.venue,
        speakers: input.speakers,
        experience: input.experience,
        comments: input.comments,
        suggestions: input.suggestions,
      },
    });
    await audit({ actorId: actor.id, action: "feedback.submitted", entityType: "event", entityId: input.eventId });
    return fb;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError("CONFLICT", "You've already submitted feedback for this event.");
    throw err;
  }
}

export async function eventFeedbackSummary(actor: SessionUser, eventId: string) {
  await requireEventAccess(actor, eventId, "canView");
  const [agg, items, distribution] = await Promise.all([
    db.feedback.aggregate({
      where: { eventId },
      _avg: { overall: true, organization: true, venue: true, speakers: true, experience: true },
      _count: { _all: true },
    }),
    db.feedback.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, overall: true, comments: true, suggestions: true, createdAt: true, user: { select: { name: true } } },
    }),
    db.feedback.groupBy({ by: ["overall"], where: { eventId }, _count: { _all: true } }),
  ]);
  const dist = [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: distribution.find((d) => d.overall === r)?._count._all ?? 0 }));
  return { count: agg._count._all, averages: agg._avg, items, distribution: dist };
}

