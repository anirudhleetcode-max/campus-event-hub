import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { db } from "./db";
import { logger } from "./logger";

/**
 * Realtime fan-out built on Postgres LISTEN/NOTIFY.
 *
 * - Any server instance publishes with `pg_notify` inside the same database
 *   that stores the data, so every instance (and every serverless function)
 *   sees the event.
 * - Each Node process keeps ONE dedicated LISTEN connection and fans messages
 *   out in-memory to its Server-Sent-Events subscribers (/api/realtime).
 *
 * Topics:
 *   event:<id>:stats       public   { registered, capacity, remaining }
 *   event:<id>:attendance  staff    { checkedIn, registered, last? }
 *   user:<id>              owner    { kind: "notification" | "payment" | "registration", ... }
 *   college:<id>           admins   { kind: "metrics" }
 *   platform               super    { kind: "metrics" }
 */
export const REALTIME_CHANNEL = "ceh_realtime";

export type RealtimeMessage = { topic: string; data: Record<string, unknown> };

export async function publish(topic: string, data: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify({ topic, data } satisfies RealtimeMessage);
  if (payload.length > 7900) {
    logger.warn("Realtime payload too large; dropped", { topic });
    return;
  }
  try {
    await db.$executeRaw`SELECT pg_notify(${REALTIME_CHANNEL}, ${payload})`;
  } catch (err) {
    logger.error("Realtime publish failed", { topic, error: err });
  }
}

type Hub = { emitter: EventEmitter; client: Client | null; connecting: Promise<void> | null };
const globalForHub = globalThis as unknown as { realtimeHub?: Hub };
const hub: Hub = (globalForHub.realtimeHub ??= { emitter: new EventEmitter(), client: null, connecting: null });
hub.emitter.setMaxListeners(10_000);

async function connect(): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const client = new Client({ connectionString: url, application_name: "ceh-realtime" });
  client.on("notification", (msg) => {
    if (msg.channel !== REALTIME_CHANNEL || !msg.payload) return;
    try {
      const parsed = JSON.parse(msg.payload) as RealtimeMessage;
      hub.emitter.emit(parsed.topic, parsed.data);
    } catch {
      /* ignore malformed payloads */
    }
  });
  client.on("error", (err) => {
    logger.error("Realtime listener error; reconnecting", { error: err });
    hub.client = null;
    client.end().catch(() => undefined);
  });
  await client.connect();
  await client.query(`LISTEN ${REALTIME_CHANNEL}`);
  hub.client = client;
}

async function ensureListener(): Promise<void> {
  if (hub.client) return;
  hub.connecting ??= connect().finally(() => {
    hub.connecting = null;
  });
  await hub.connecting;
}

/** Subscribe to topics; returns an unsubscribe function. */
export async function subscribe(topics: string[], onMessage: (topic: string, data: Record<string, unknown>) => void) {
  await ensureListener();
  const handlers = topics.map((topic) => {
    const h = (data: Record<string, unknown>) => onMessage(topic, data);
    hub.emitter.on(topic, h);
    return [topic, h] as const;
  });
  return () => handlers.forEach(([t, h]) => hub.emitter.off(t, h));
}

// ─── Domain publishers ─────────────────────────────────────

export async function publishEventStats(eventId: string): Promise<void> {
  const now = new Date();
  const [event, registered, held, checkedIn] = await Promise.all([
    db.event.findUnique({ where: { id: eventId }, select: { capacity: true, collegeId: true } }),
    db.registration.count({ where: { eventId, status: "CONFIRMED" } }),
    db.registration.count({ where: { eventId, status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } } }),
    db.attendance.count({ where: { eventId } }),
  ]);
  if (!event) return;
  const taken = registered + held;
  await Promise.all([
    publish(`event:${eventId}:stats`, { registered, capacity: event.capacity, remaining: Math.max(0, event.capacity - taken) }),
    publish(`event:${eventId}:attendance`, { registered, checkedIn }),
    publish(`college:${event.collegeId}`, { kind: "metrics" }),
    publish("platform", { kind: "metrics" }),
  ]);
}
