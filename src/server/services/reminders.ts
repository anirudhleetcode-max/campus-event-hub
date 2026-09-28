import "server-only";
import { db } from "../db";
import { logger } from "../logger";
import { notify } from "../notifications";
import { formatDateRange } from "@/lib/utils";
import { getSettings } from "./settings";

function describeOffset(hours: number): string {
  if (hours % 24 === 0) {
    const d = hours / 24;
    return d === 1 ? "tomorrow" : `in ${d} days`;
  }
  return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
}

/**
 * Sends scheduled reminders to confirmed participants. Offsets are
 * configurable (Settings → reminder offsets). Idempotent via the unique
 * (registration_id, offset_hours) key on reminder_logs, so running the cron
 * more often than necessary never double-sends. If several offsets are due at
 * once (e.g. someone registered 2 hours before), only the nearest is sent.
 */
export async function sendDueReminders(now = new Date()) {
  const { reminderOffsetsHours } = await getSettings();
  const offsets = [...reminderOffsetsHours].sort((a, b) => a - b);
  const maxOffset = offsets[offsets.length - 1] ?? 0;
  const events = await db.event.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED"] },
      startsAt: { gt: now, lte: new Date(now.getTime() + maxOffset * 3_600_000) },
    },
    select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, venueName: true },
  });

  let sent = 0;
  for (const event of events) {
    const hoursLeft = (event.startsAt.getTime() - now.getTime()) / 3_600_000;
    const due = offsets.filter((o) => hoursLeft <= o);
    if (due.length === 0) continue;
    const nearest = due[0]!;
    const regs = await db.registration.findMany({
      where: { eventId: event.id, status: "CONFIRMED", reminders: { none: { offsetHours: nearest } } },
      select: { id: true, userId: true },
    });
    if (regs.length === 0) continue;

    // Claim first, then deliver only what this run claimed. The insert skips
    // rows another (overlapping) run already claimed and returns only the new
    // rows, so concurrent cron invocations never double-send.
    const claimed = await db.reminderLog.createManyAndReturn({
      data: regs.flatMap((r) => due.map((o) => ({ registrationId: r.id, offsetHours: o, delivered: o === nearest }))),
      skipDuplicates: true,
      select: { registrationId: true, offsetHours: true },
    });
    const mine = new Set(claimed.filter((c) => c.offsetHours === nearest).map((c) => c.registrationId));
    const recipients = regs.filter((r) => mine.has(r.id));
    if (recipients.length === 0) continue;
    await notify(
      recipients.map((r) => r.userId),
      {
        type: "EVENT_REMINDER",
        title: `Reminder: ${event.title} starts ${describeOffset(nearest)}`,
        body: `${formatDateRange(event.startsAt, event.endsAt)}${event.venueName ? ` · ${event.venueName}` : ""}. Keep your QR pass ready for check-in.`,
        link: `/events/${event.slug}`,
        email: true,
        emailCta: "View event details",
      },
    );
    sent += recipients.length;
    logger.info("Reminders sent", { eventId: event.id, offsetHours: nearest, count: recipients.length });
  }
  return { events: events.length, sent };
}
