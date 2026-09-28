import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getCurrentUser, type SessionUser } from "./auth/session";

/** For server components: returns the user or redirects to login / their home. */
export async function pageUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function sp(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function pageNum(params: SearchParams): number {
  const n = Number(sp(params, "page"));
  return Number.isInteger(n) && n > 0 ? n : 1;
}
