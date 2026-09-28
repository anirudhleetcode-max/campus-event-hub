import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";

/**
 * Organizer / event-staff area. Staff roles pass straight through; students
 * are only let in when they volunteer as a scanner for at least one event —
 * every page then checks its own event-level permission (students can only
 * ever reach the scan page).
 */
export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "events:staff-area")) {
    const assignment = await db.eventVolunteer.findFirst({
      where: { userId: user.id, canScan: true, event: { deletedAt: null } },
      select: { id: true },
    });
    if (!assignment) redirect("/dashboard");
  }
  return <>{children}</>;
}
