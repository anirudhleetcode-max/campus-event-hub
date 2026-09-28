"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { cancelOwnRegistration } from "@/server/services/registrations";
import { submitFeedback } from "@/server/services/feedback";
import { updateProfile } from "@/server/services/users";
import type { ActionResult } from "@/lib/action-result";

/** Student cancels their own registration (paid ones raise a refund request). */
export async function cancelMyRegistrationAction(registrationId: string): Promise<ActionResult<{ refundRequested: boolean }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (!z.uuid().safeParse(registrationId).success) throw new AppError("NOT_FOUND", "Registration could not be found.");
    const res = await cancelOwnRegistration(user, registrationId);
    revalidatePath("/my/registrations");
    revalidatePath(`/my/registrations/${registrationId}`);
    revalidatePath("/dashboard");
    return res;
  });
}

export async function submitFeedbackAction(input: Record<string, unknown>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    const fb = await submitFeedback(user, input);
    revalidatePath(`/my/registrations/${fb.registrationId}`);
    revalidatePath("/my/registrations");
    revalidatePath("/dashboard");
    return null;
  }, "Thanks! Your feedback has been submitted.");
}

export async function updateProfileAction(input: Record<string, unknown>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    await updateProfile(user, input);
    revalidatePath("/profile");
    revalidatePath("/", "layout");
    return null;
  }, "Profile updated.");
}
