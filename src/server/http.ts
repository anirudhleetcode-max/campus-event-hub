import "server-only";
import { NextResponse } from "next/server";
import { env } from "./env";
import { AppError, toAppError } from "./errors";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } });
}

export function errorResponse(err: unknown, context?: Record<string, unknown>) {
  const e = toAppError(err, context);
  return json({ error: e.message, code: e.code, fieldErrors: e.fieldErrors, details: e.code === "ALREADY_CHECKED_IN" ? e.details : undefined }, { status: e.status });
}

/**
 * CSRF defence for cookie-authenticated JSON route handlers: state-changing
 * requests must come from our own origin. (Server Actions get this check
 * from Next.js automatically.)
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env().NEXT_PUBLIC_APP_URL).origin]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    allowed.add(`${proto}://${host}`);
  }
  if (!origin || !allowed.has(origin)) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
}

export async function readJson<T = unknown>(req: Request, maxBytes = 64 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("VALIDATION", "Request body too large.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("VALIDATION", "Malformed request body.");
  }
}
