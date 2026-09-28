/** Result shape returned by every server action (safe to serialise to the client). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string> };
