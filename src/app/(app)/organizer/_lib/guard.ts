import "server-only";
import { cache } from "react";
import type { EventStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { can } from "@/server/auth/permissions";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getEventForStaff } from "@/server/services/events";
import { EVENT_STATUS } from "@/lib/labels";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** First value of a search parameter. */
export function param(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim().slice(0, 200) : undefined;
}

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(param(v));
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

/** A valid EventStatus from the URL (anything else is ignored rather than reaching the database). */
export function eventStatusParam(v: string | string[] | undefined): EventStatus | undefined {
  const s = param(v);
  return s && s in EVENT_STATUS ? (s as EventStatus) : undefined;
}

/** Signed-in user for organizer pages. Students are sent back to their own dashboard. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "events:staff-area")) redirect("/dashboard");
  return user;
}

export type Guarded<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Runs a service call for a page. Permission failures become a friendly
 * forbidden state, missing records become a 404; anything else bubbles up to
 * the route's error boundary.
 */
export async function guarded<T>(fn: () => Promise<T>): Promise<Guarded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === "NOT_FOUND") notFound();
      if (err.code === "FORBIDDEN") return { ok: false, message: err.message };
      if (err.code === "UNAUTHENTICATED") redirect("/login");
    }
    throw err;
  }
}

/** Per-request memoised event lookup shared by the event layout and its pages. */
export const loadStaffEvent = cache(async (eventId: string) => {
  if (!isUuid(eventId)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const res = await guarded(() => getEventForStaff(user, eventId));
  return { user, res };
});
