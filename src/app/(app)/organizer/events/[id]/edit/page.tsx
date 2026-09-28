import type { Metadata } from "next";
import { db } from "@/server/db";
import { Alert } from "@/components/ui/misc";
import { EventWizard } from "@/components/organizer/event-wizard";
import { wizardStateFromEvent } from "@/components/organizer/event-wizard-state";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { EDITABLE_STATUSES } from "@/lib/event-status";
import { EVENT_STATUS } from "@/lib/labels";
import { loadStaffEvent } from "@/app/(app)/organizer/_lib/guard";
import { wizardOptions } from "@/app/(app)/organizer/_lib/wizard-data";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: PageProps<"/organizer/events/[id]/edit">) {
  const { id } = await params;
  const { res } = await loadStaffEvent(id);
  if (!res.ok) return null;
  const { event, access } = res.data;
  if (!access.canManage) return <ForbiddenState message="You have read-only access to this event." backHref={`/organizer/events/${id}`} backLabel="Back to event" />;
  if (!EDITABLE_STATUSES.includes(event.status)) {
    return (
      <Alert tone="info" title="This event can no longer be edited">
        {EVENT_STATUS[event.status].label} events are read-only. Duplicate it from the actions menu to reuse its details.
      </Alert>
    );
  }
  const [options, activeRegistrations] = await Promise.all([
    wizardOptions(event.collegeId),
    db.registration.count({ where: { eventId: id, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } }),
  ]);
  const publishAction = access.canApprove || !event.college.requireEventApproval ? "publish" : "submit";

  return (
    <div className="space-y-4">
      {event.status !== "DRAFT" && event.status !== "PENDING_APPROVAL" && (
        <Alert tone="info" title="This event is live">
          Registered participants are notified automatically if you change the venue or timing.
        </Alert>
      )}
      <EventWizard
        eventId={event.id}
        status={event.status}
        initial={wizardStateFromEvent(event)}
        categories={options.categories}
        departments={options.departments}
        venues={options.venues}
        publishAction={publishAction}
        feeLocked={activeRegistrations > 0}
      />
    </div>
  );
}
