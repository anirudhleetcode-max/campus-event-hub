import type { Metadata } from "next";
import { attendanceSummary } from "@/server/services/attendance";
import { Alert } from "@/components/ui/misc";
import { ForbiddenState } from "@/components/organizer/forbidden-state";
import { QrScanner } from "@/components/scanner/qr-scanner";
import { guarded, loadStaffEvent } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Scan passes" };

export default async function EventScanPage({ params }: PageProps<"/organizer/events/[id]/scan">) {
  const { id } = await params;
  const { user, res: ev } = await loadStaffEvent(id);
  if (!ev.ok) return null;
  if (!ev.data.access.canScan) return <ForbiddenState message="You haven't been given check-in scanning access for this event." />;
  const res = await guarded(() => attendanceSummary(user, id));
  if (!res.ok) return <ForbiddenState message={res.message} />;
  const { event } = ev.data;
  const closed = ["DRAFT", "PENDING_APPROVAL", "CANCELLED", "ARCHIVED"].includes(event.status);

  return (
    <div className="space-y-4">
      {closed && (
        <Alert tone="warning" title="Check-in isn't available">
          Passes can only be checked in for published events, from 24 hours before the start until 24 hours after the end.
        </Alert>
      )}
      <QrScanner eventId={id} initial={{ registered: res.data.registered, checkedIn: res.data.checkedIn }} />
    </div>
  );
}
