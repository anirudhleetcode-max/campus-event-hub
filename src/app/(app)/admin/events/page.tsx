import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listStaffEvents } from "@/server/services/events";
import { pageUser } from "@/server/page-guard";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { EventTable } from "@/components/organizer/event-table";
import { eventStatusParam, pageParam, param } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Events" };

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const sp = await searchParams;
  const data = await listStaffEvents(user, { q: param(sp.q), status: eventStatusParam(sp.status), page: pageParam(sp.page) });
  const createButton = (
    <Link href="/organizer/events/new" className={buttonClasses("primary")}>
      <Plus /> Create event
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Events"
        description={user.role === "SUPER_ADMIN" ? "Every event on the platform. Review approvals, publish, cancel or archive." : `All events at ${user.collegeName ?? "your college"}. Review approvals, publish, cancel or archive.`}
        actions={createButton}
      />
      <EventTable data={data} basePath="/admin/events" searchParams={sp} showCollege={user.role === "SUPER_ADMIN"} viewer={user} emptyAction={createButton} />
    </>
  );
}
