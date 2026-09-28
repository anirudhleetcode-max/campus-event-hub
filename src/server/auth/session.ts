import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Role, User } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { hmacSha256Hex, randomToken } from "../crypto";
import { AppError } from "../errors";

export const SESSION_COOKIE = "ceh_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "status" | "collegeId" | "departmentId" | "avatarUrl"
> & { collegeName: string | null };

/** Session tokens are stored as keyed hashes so a DB leak cannot be replayed. */
function tokenHash(token: string): string {
  return hmacSha256Hex(env().AUTH_SECRET, token);
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { tokenHash: tokenHash(token), userId, expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

/** Resolves a session token to an active user (or null). */
export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: {
      user: {
        select: {
          id: true, email: true, name: true, role: true, status: true, collegeId: true,
          departmentId: true, avatarUrl: true, deletedAt: true,
          college: { select: { name: true, status: true } },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (u.status !== "ACTIVE" || u.deletedAt) return null;
  if (u.role !== "SUPER_ADMIN" && u.college?.status === "SUSPENDED") return null;
  if (Date.now() - session.lastSeenAt.getTime() > 60 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, collegeId: u.collegeId,
    departmentId: u.departmentId, avatarUrl: u.avatarUrl, collegeName: u.college?.name ?? null,
  };
}

/** Current user for this request (memoised per request). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AppError("FORBIDDEN", "You don't have permission to access this area.");
  return user;
}
