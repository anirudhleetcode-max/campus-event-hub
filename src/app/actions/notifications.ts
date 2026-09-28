"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { requireUser } from "@/server/auth/session";
import { markNotificationsRead } from "@/server/services/communications";

export async function markReadAction(ids: string[] | "all") {
  return runAction(async () => {
    const user = await requireUser();
    await markNotificationsRead(user, ids === "all" ? "all" : ids.slice(0, 200));
    revalidatePath("/notifications");
    return null;
  });
}
