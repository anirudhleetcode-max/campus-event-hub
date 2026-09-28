import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { can } from "@/server/auth/permissions";
import { listStaffEvents } from "@/server/services/events";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { EventTable } from "@/components/organizer/event-table";
import { eventStatusParam, pageParam, param, requireStaff } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Events" };

export default async function OrganizerEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const data = await listStaffEvents(user, { q: param(sp.q), status: eventStatusParam(sp.status), page: pageParam(sp.page) });
  const canCreate = can(user, "events:create");
  const createButton = canCreate ? (
    <Link href="/organizer/events/new" className={buttonClasses("primary")}>
      <Plus /> Create event
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={user.role === "FACULTY_COORDINATOR" ? "Assigned events" : "Events"}
        description={
          user.role === "FACULTY_COORDINATOR"
            ? "Events you coordinate. You have read-only access to their registrations, attendance and reports."
            : "Create, publish and manage your events."
        }
        actions={createButton}
      />
      <EventTable data={data} basePath="/organizer/events" searchParams={sp} showCollege={user.role === "SUPER_ADMIN"} viewer={user} emptyAction={createButton} />
    </>
  );
}
