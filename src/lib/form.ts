import type { ZodError } from "zod";

/** Flattens zod issues into { "field.path": "first message" } for inline form errors. */
export function zodErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
