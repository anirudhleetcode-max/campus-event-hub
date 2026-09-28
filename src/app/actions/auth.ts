"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/server/action";
import { clientIp, userAgent } from "@/server/request";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import * as auth from "@/server/services/auth";
import { homeFor } from "@/components/layout/nav-config";
import type { ActionResult } from "@/lib/action-result";
import { safeNextPath } from "@/lib/form-errors";


export async function loginAction(input: { email: string; password: string; next?: string }): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const { role } = await auth.login(input, { ip: await clientIp(), userAgent: await userAgent() });
    return { redirectTo: safeNextPath(input.next) ?? homeFor(role) };
  });
}

export async function signupAction(input: Record<string, unknown>): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    await auth.signup(input, { ip: await clientIp(), userAgent: await userAgent() });
    return { redirectTo: safeNextPath(input.next) ?? "/dashboard" };
  });
}

export async function logoutAction() {
  await auth.logout(await getCurrentUser());
  redirect("/login");
}

export async function forgotPasswordAction(input: { email: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await auth.requestPasswordReset(input, { ip: await clientIp() });
    return null;
  }, "If an account exists for that email, a reset link is on its way.");
}

export async function resetPasswordAction(input: { token: string; password: string; confirmPassword: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await auth.resetPassword(input);
    return null;
  }, "Your password has been reset. Please sign in.");
}

export async function changePasswordAction(input: { currentPassword: string; password: string; confirmPassword: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    await auth.changePassword(user, input, { ip: await clientIp(), userAgent: await userAgent() });
    return null;
  }, "Password updated. Other sessions have been signed out.");
}
