"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/action";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { cancelOwnRegistration, registerForEvent } from "@/server/services/registrations";
import type { ActionResult } from "@/lib/action-result";

export type RegisterActionInput = {
  eventId: string;
  phone?: string;
  studentId?: string;
  departmentName?: string;
  year?: string;
  answers: Record<string, string>;
};

export type RegisterActionData = {
  registrationId: string;
  code: string;
  status: "CONFIRMED" | "PENDING_PAYMENT";
  requiresPayment: boolean;
  holdExpiresAt: string | null;
};

/** Registers the signed-in student; the service validates everything (window, seats, required fields, answers). */
export async function registerAction(input: RegisterActionInput): Promise<ActionResult<RegisterActionData>> {
  return runAction(async () => {
    const user = await requireUser();
    const res = await registerForEvent(user, input);
    revalidatePath("/my/registrations");
    revalidatePath("/dashboard");
    return { ...res, holdExpiresAt: res.holdExpiresAt ? res.holdExpiresAt.toISOString() : null };
  });
}

/** Student cancels their own registration (paid ones raise a refund request for the organizer). */
export async function cancelRegistrationAction(registrationId: string): Promise<ActionResult<{ refundRequested: boolean }>> {
  return runAction(async () => {
    const user = await requireUser();
    if (!z.uuid().safeParse(registrationId).success) throw new AppError("NOT_FOUND", "Registration could not be found.");
    const res = await cancelOwnRegistration(user, registrationId);
    revalidatePath("/my/registrations");
    revalidatePath(`/my/registrations/${registrationId}`);
    return res;
  }, "Your registration has been cancelled.");
}
