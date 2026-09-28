import type { Metadata } from "next";
import { dashboardAnalytics, resolveRange } from "@/server/services/analytics";
import { PageHeader } from "@/components/ui/misc";
import { AnalyticsView } from "@/components/organizer/analytics-view";
import { param, requireStaff } from "@/app/(app)/organizer/_lib/guard";

export const metadata: Metadata = { title: "Analytics" };

export default async function OrganizerAnalyticsPage({ searchParams }: PageProps<"/organizer/analytics">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const range = resolveRange(param(sp.range), param(sp.from), param(sp.to));
  const data = await dashboardAnalytics(user, range);
  const qs = new URLSearchParams({ range: range.preset });
  if (range.preset === "custom") {
    const from = param(sp.from);
    const to = param(sp.to);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
  }

  return (
    <>
      <PageHeader
        title={user.role === "FACULTY_COORDINATOR" ? "Reports" : "Analytics"}
        description="Registrations, revenue and attendance across the events you manage."
      />
      <AnalyticsView data={data} exportHref={`/api/exports/analytics?${qs.toString()}`} />
    </>
  );
}
