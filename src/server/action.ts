import "server-only";
import type { ActionResult } from "@/lib/action-result";
import { toAppError } from "./errors";

/**
 * Runs a server-action body and converts any thrown error into a safe
 * ActionResult (no stack traces or internals reach the client).
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    // next/navigation redirect()/notFound() work by throwing — let them through.
    if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string" && /^NEXT_/.test((err as { digest: string }).digest)) {
      throw err;
    }
    const e = toAppError(err);
    return { ok: false, error: e.message, code: e.code, fieldErrors: e.fieldErrors };
  }
}

/** Parse FormData into a plain object; repeated keys become arrays. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const v = typeof value === "string" ? value : value;
    if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else out[key] = v;
  }
  return out;
}
