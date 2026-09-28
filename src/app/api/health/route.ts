import { db } from "@/server/db";
import { json } from "@/server/http";
import { razorpayConfigured } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers and uptime monitors. */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ status: "ok", database: "up", payments: razorpayConfigured() ? "configured" : "not_configured", latencyMs: Date.now() - started });
  } catch {
    return json({ status: "degraded", database: "down" }, { status: 503 });
  }
}
