import "server-only";
import { db } from "../db";
import { appUrl } from "../env";
import { AppError } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import { hmacSha256Hex, randomToken } from "../crypto";
import { env } from "../env";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { createSession, destroyAllSessions, destroySession, type SessionUser } from "../auth/session";
import { rateLimit, refundRateLimit } from "../rate-limit";
import { emailLayout, sendEmail } from "../mailer";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema, signupSchema, changePasswordSchema } from "@/lib/validators";
import { getSettings } from "./settings";

const GENERIC_LOGIN_ERROR = "The email or password you entered is incorrect.";

export async function login(raw: unknown, meta: { ip: string; userAgent?: string }) {
  const input = loginSchema.parse(raw);
  // Per-IP limits are generous because a whole campus often shares one NAT
  // address; the per-account limit is what stops password guessing. It only
  // accumulates FAILED attempts (a successful login refunds its slot below), so
  // many people signing in to one shared demo account never lock it.
  const accountKey = `login:email:${input.email}`;
  await rateLimit(`login:ip:${meta.ip}`, 200, 15 * 60);
  await rateLimit(accountKey, 10, 15 * 60);

  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, status: true, deletedAt: true, role: true, college: { select: { status: true } } },
  });
  const ok = user ? await verifyPassword(input.password, user.passwordHash) : await burnPasswordCheck(input.password);
  if (!user || !ok) {
    logger.warn("Authentication failed", { reason: user ? "bad_password" : "unknown_email", ip: meta.ip });
    if (user) await audit({ actorId: user.id, action: "auth.login_failed", entityType: "user", entityId: user.id, ipAddress: meta.ip });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }
  if (user.status !== "ACTIVE" || user.deletedAt) {
    throw new AppError("FORBIDDEN", "This account has been suspended. Please contact your college administrator.");
  }
  if (user.role !== "SUPER_ADMIN" && user.college?.status === "SUSPENDED") {
    throw new AppError("FORBIDDEN", "Your institution's access is currently suspended. Please contact support.");
  }
  await createSession(user.id, meta);
  await refundRateLimit(accountKey);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ipAddress: meta.ip });
  return { role: user.role };
}

export async function signup(raw: unknown, meta: { ip: string; userAgent?: string }) {
  const settings = await getSettings();
  if (!settings.allowStudentSignup) throw new AppError("FORBIDDEN", "Self sign-up is currently disabled. Ask your college administrator for an account.");
  await rateLimit(`signup:ip:${meta.ip}`, 60, 60 * 60);
  const input = signupSchema.parse(raw);
  const college = await db.college.findFirst({ where: { id: input.collegeId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!college) throw new AppError("VALIDATION", "Please select a valid college.", { fieldErrors: { collegeId: "Select your college" } });
  const exists = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (exists) {
    throw new AppError("CONFLICT", "An account with this email already exists. Try signing in instead.", {
      fieldErrors: { email: "This email is already registered" },
    });
  }
  const user = await db.user.create({
    data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), role: "STUDENT", collegeId: college.id },
    select: { id: true },
  });
  await audit({ actorId: user.id, action: "auth.signup", entityType: "user", entityId: user.id, ipAddress: meta.ip });
  await createSession(user.id, meta);
  return user;
}

export async function logout(actor: SessionUser | null) {
  await destroySession();
  if (actor) await audit({ actorId: actor.id, action: "auth.logout", entityType: "user", entityId: actor.id });
}

const resetHash = (token: string) => hmacSha256Hex(env().AUTH_SECRET, `reset:${token}`);

/** Always succeeds from the caller's perspective (no account enumeration). */
export async function requestPasswordReset(raw: unknown, meta: { ip: string }) {
  const { email } = forgotPasswordSchema.parse(raw);
  await rateLimit(`reset:ip:${meta.ip}`, 30, 60 * 60);
  await rateLimit(`reset:email:${email}`, 3, 60 * 60);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, status: true } });
  if (!user || user.status !== "ACTIVE") return;
  const token = randomToken(32);
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: resetHash(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  const { html, text } = emailLayout({
    heading: "Reset your password",
    paragraphs: [`Hi ${user.name}, we received a request to reset your password. This link expires in 1 hour.`, "If you didn't request this, you can safely ignore this email."],
    cta: { label: "Reset password", url: appUrl(`/reset-password?token=${token}`) },
  });
  await sendEmail({ to: user.email, subject: "Reset your Campus Event Hub password", template: "password_reset", html, text });
  await audit({ actorId: user.id, action: "auth.password_reset_requested", entityType: "user", entityId: user.id, ipAddress: meta.ip });
}

export async function resetPassword(raw: unknown) {
  const input = resetPasswordSchema.parse(raw);
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: resetHash(input.token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new AppError("VALIDATION", "This reset link is invalid or has expired. Please request a new one.");
  }
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(input.password) } }),
    db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  await destroyAllSessions(row.userId);
  await audit({ actorId: row.userId, action: "auth.password_reset", entityType: "user", entityId: row.userId });
}

export async function changePassword(actor: SessionUser, raw: unknown, meta: { ip: string; userAgent?: string }) {
  const input = changePasswordSchema.parse(raw);
  await rateLimit(`pwchange:${actor.id}`, 5, 15 * 60);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION", "Your current password is incorrect.", { fieldErrors: { currentPassword: "Incorrect password" } });
  }
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await hashPassword(input.password) } });
  await destroyAllSessions(actor.id);
  await createSession(actor.id, meta);
  await audit({ actorId: actor.id, action: "auth.password_changed", entityType: "user", entityId: actor.id });
}
