import type { ZodError } from "zod";

/** Flattens zod issues into `{ "path.to.field": "first message" }` for inline form errors. */
export function zodToFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only allow same-site relative paths (prevents open redirects via ?next=). */
export function safeNextPath(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}
