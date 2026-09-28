import { getCurrentUser } from "@/server/auth/session";
import { getEventAccess } from "@/server/auth/permissions";
import { subscribe } from "@/server/realtime";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_TOPICS = 10;
const STREAM_LIFETIME_MS = 280_000; // < maxDuration; EventSource reconnects automatically

/** Authorise each requested topic for the current user. Unknown/forbidden topics are dropped. */
async function allowedTopics(requested: string[]): Promise<string[]> {
  const user = await getCurrentUser();
  const out: string[] = [];
  for (const topic of requested.slice(0, MAX_TOPICS)) {
    const eventStats = /^event:([0-9a-f-]{36}):stats$/.exec(topic);
    const eventAttendance = /^event:([0-9a-f-]{36}):attendance$/.exec(topic);
    const userTopic = /^user:([0-9a-f-]{36})$/.exec(topic);
    const college = /^college:([0-9a-f-]{36})$/.exec(topic);
    if (eventStats) out.push(topic); // public seat counts
    else if (eventAttendance && user) {
      const res = await getEventAccess(user, eventAttendance[1]!).catch(() => null);
      if (res && (res.access.canView || res.access.canScan)) out.push(topic);
    } else if (userTopic && user?.id === userTopic[1]) out.push(topic);
    else if (college && user && (user.role === "SUPER_ADMIN" || (user.role === "COLLEGE_ADMIN" && user.collegeId === college[1]))) out.push(topic);
    else if (topic === "platform" && user?.role === "SUPER_ADMIN") out.push(topic);
  }
  return out;
}

export async function GET(req: Request) {
  const requested = (new URL(req.url).searchParams.get("topics") ?? "").split(",").filter(Boolean);
  const topics = await allowedTopics(requested);
  if (topics.length === 0) return new Response("No authorised topics", { status: 403 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\n: connected\n\n`);
      let unsubscribe: () => void = () => {};
      try {
        unsubscribe = await subscribe(topics, (topic, data) => send(`data: ${JSON.stringify({ topic, data })}\n\n`));
      } catch (err) {
        logger.error("Realtime subscribe failed", { error: err });
        controller.close();
        return;
      }
      // Comment frames keep proxies from closing an idle connection.
      const keepAlive = setInterval(() => send(`: keep-alive\n\n`), 25_000);
      const lifetime = setTimeout(() => cleanup(), STREAM_LIFETIME_MS);
      cleanup = () => {
        clearInterval(keepAlive);
        clearTimeout(lifetime);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
