import type { Metadata } from "next";
import { can } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/misc";
import { EventWizard } from "@/components/organizer/event-wizard";
import { emptyWizardState } from "@/components/organizer/event-wizard-state";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { requireStaff } from "@/app/(app)/organizer/_lib/guard";
import { wizardOptions } from "@/app/(app)/organizer/_lib/wizard-data";

export const metadata: Metadata = { title: "Create event" };

export default async function NewEventPage() {
  const user = await requireStaff();
  if (!can(user, "events:create")) return <ForbiddenState message="Only organizers and administrators can create events." backHref="/organizer/events" backLabel="Back to events" />;
  const isSuper = user.role === "SUPER_ADMIN";
  if (!isSuper && !user.collegeId) return <ForbiddenState message="Your account isn't linked to a college, so you can't create events yet." />;

  const [options, colleges, college] = await Promise.all([
    wizardOptions(isSuper ? null : user.collegeId),
    isSuper ? db.college.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(undefined),
    user.collegeId ? db.college.findUnique({ where: { id: user.collegeId }, select: { requireEventApproval: true } }) : Promise.resolve(null),
  ]);
  const publishAction = can(user, "events:approve") || !college?.requireEventApproval ? "publish" : "submit";

  return (
    <>
      <PageHeader
        title="Create event"
        description="Set up your event in a few steps. You can save a draft at any point and publish when you're ready."
        breadcrumbs={[{ label: "Events", href: "/organizer/events" }, { label: "New event" }]}
      />
      <EventWizard
        initial={emptyWizardState(isSuper ? "" : (user.collegeId ?? ""))}
        categories={options.categories}
        departments={options.departments}
        venues={options.venues}
        colleges={colleges}
        publishAction={publishAction}
      />
    </>
  );
}
