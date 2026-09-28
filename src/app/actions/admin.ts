"use server";

import { revalidatePath } from "next/cache";
import type { CollegeStatus, Role, SubscriptionPlan, UserStatus } from "@prisma/client";
import { z } from "zod";
import { runAction } from "@/server/action";
import { requireUser } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { clientIp } from "@/server/request";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import * as users from "@/server/services/users";
import * as inst from "@/server/services/institutions";
import { sendAnnouncement } from "@/server/services/communications";
import { saveSettings } from "@/server/services/settings";
import { settingsSchema } from "@/lib/validators";

const ROLES = ["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER", "FACULTY_COORDINATOR", "STUDENT"] as const;
const uuid = z.uuid();

export async function setUserStatusAction(userId: string, status: UserStatus) {
  return runAction(async () => {
    const user = await requireUser();
    if (!["ACTIVE", "SUSPENDED", "DEACTIVATED"].includes(status)) throw new AppError("VALIDATION", "Invalid status.");
    await users.setUserStatus(user, uuid.parse(userId), status, { ip: await clientIp() });
    revalidatePath("/admin/users");
    return null;
  }, status === "ACTIVE" ? "User activated." : "User suspended and signed out.");
}

export async function changeUserRoleAction(userId: string, role: Role) {
  return runAction(async () => {
    const user = await requireUser();
    await users.changeUserRole(user, uuid.parse(userId), z.enum(ROLES).parse(role), { ip: await clientIp() });
    revalidatePath("/admin/users");
    return null;
  }, "Role updated. The user will need to sign in again.");
}

export async function createUserAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const user = await requireUser();
    const created = await users.createUser(user, input);
    revalidatePath("/admin/users");
    return created;
  }, "User account created.");
}

export async function saveCollegeAction(id: string | null, input: Record<string, unknown>) {
  return runAction(async () => {
    const user = await requireUser();
    const college = await inst.saveCollege(user, id ? uuid.parse(id) : null, input);
    revalidatePath("/admin/colleges");
    return { id: college.id };
  }, id ? "College updated." : "College created.");
}

export async function setCollegeStatusAction(id: string, status: CollegeStatus) {
  return runAction(async () => {
    const user = await requireUser();
    await inst.setCollegeStatus(user, uuid.parse(id), status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE");
    revalidatePath("/admin/colleges");
    return null;
  }, status === "SUSPENDED" ? "Institution suspended." : "Institution reactivated.");
}

export async function updateSubscriptionAction(collegeId: string, input: { plan: SubscriptionPlan; status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED"; eventLimit: string }) {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = z
      .object({
        plan: z.enum(["FREE", "PRO", "ENTERPRISE"]),
        status: z.enum(["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"]),
        eventLimit: z.union([z.literal(""), z.coerce.number().int().min(1).max(100000)]),
      })
      .parse(input);
    await inst.updateSubscription(user, uuid.parse(collegeId), parsed.plan, parsed.status, parsed.eventLimit === "" ? null : parsed.eventLimit);
    revalidatePath(`/admin/colleges/${collegeId}`);
    return null;
  }, "Subscription updated.");
}

export async function saveDepartmentAction(id: string | null, input: Record<string, unknown>) {
  return runAction(async () => {
    const user = await requireUser();
    await inst.saveDepartment(user, id ? uuid.parse(id) : null, input);
    revalidatePath("/admin/departments");
    return null;
  }, id ? "Department updated." : "Department added.");
}

export async function deleteDepartmentAction(id: string) {
  return runAction(async () => {
    const user = await requireUser();
    await inst.deleteDepartment(user, uuid.parse(id));
    revalidatePath("/admin/departments");
    return null;
  }, "Department removed.");
}

export async function sendAnnouncementAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const user = await requireUser();
    const res = await sendAnnouncement(user, input);
    revalidatePath("/admin/notifications");
    return res;
  });
}

export async function saveSettingsAction(input: Record<string, unknown>) {
  return runAction(async () => {
    const user = await requireUser();
    assertCan(user, "settings:manage");
    const parsed = settingsSchema.parse(input);
    await saveSettings({ ...parsed, maintenanceBanner: parsed.maintenanceBanner }, user.id);
    await audit({ actorId: user.id, action: "settings.updated", entityType: "system_settings", entityId: "platform", metadata: parsed });
    revalidatePath("/admin/settings");
    return null;
  }, "Settings saved.");
}
