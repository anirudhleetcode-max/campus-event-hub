import "server-only";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "./logger";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "EVENT_FULL"
  | "REGISTRATION_CLOSED"
  | "ALREADY_REGISTERED"
  | "INVALID_TRANSITION"
  | "PAYMENT_ERROR"
  | "PAYMENTS_NOT_CONFIGURED"
  | "INVALID_QR"
  | "ALREADY_CHECKED_IN"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  EVENT_FULL: 409,
  REGISTRATION_CLOSED: 409,
  ALREADY_REGISTERED: 409,
  INVALID_TRANSITION: 409,
  PAYMENT_ERROR: 402,
  PAYMENTS_NOT_CONFIGURED: 503,
  INVALID_QR: 422,
  ALREADY_CHECKED_IN: 409,
  INTERNAL: 500,
};

/** An error whose message is safe to show to end users. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string>;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { fieldErrors?: Record<string, string>; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = opts.fieldErrors;
    this.details = opts.details;
  }

  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "The requested item") => new AppError("NOT_FOUND", `${what} could not be found.`);
export const forbidden = (msg = "You don't have permission to perform this action.") => new AppError("FORBIDDEN", msg);

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Normalises any thrown value into a user-safe AppError, logging unexpected ones. */
export function toAppError(err: unknown, context?: Record<string, unknown>): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError("VALIDATION", "Please correct the highlighted fields.", { fieldErrors: zodFieldErrors(err) });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return new AppError("CONFLICT", "This record already exists.");
    if (err.code === "P2025") return notFound();
  }
  logger.error("Unhandled server error", { ...context, error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) });
  return new AppError("INTERNAL", "Something went wrong on our side. Please try again in a moment.");
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
