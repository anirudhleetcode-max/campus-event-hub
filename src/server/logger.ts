import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT = /pass(word)?|secret|token|signature|authorization|cookie|api[_-]?key|card|cvv|otp/i;

/** Recursively masks values whose keys look sensitive. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      REDACT.test(k) ? "[REDACTED]" : redact(v, depth + 1),
    ]),
  );
}

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level | undefined) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
  return order[lvl] ?? order.info;
}

function write(level: Level, msg: string, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  if (order[level] < threshold()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured JSON logger. Sensitive keys are redacted automatically. */
export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};
