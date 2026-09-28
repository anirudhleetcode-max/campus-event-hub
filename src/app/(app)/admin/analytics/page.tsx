import type { Metadata } from "next";
import { dashboardAnalytics, resolveRange } from "@/server/services/analytics";
import { pageUser, sp as first, type SearchParams } from "@/server/page-guard";
import { PageHeader } from "@/components/ui/misc";
import { AnalyticsView } from "@/components/organizer/analytics-view";
import { LiveRefresh } from "@/components/realtime/live-refresh";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const range = resolveRange(first(params, "range"), first(params, "from"), first(params, "to"));
  const data = await dashboardAnalytics(user, range);
  const qs = new URLSearchParams({ range: range.preset });
  if (range.preset === "custom") {
    const from = first(params, "from");
    const to = first(params, "to");
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
  }
  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          <span className="inline-flex flex-wrap items-center gap-3">
            {user.role === "SUPER_ADMIN" ? "Platform-wide performance across every college." : `Performance across ${user.collegeName ?? "your college"}.`}
            <LiveRefresh topics={user.role === "SUPER_ADMIN" ? ["platform"] : [`college:${user.collegeId}`]} />
          </span>
        }
      />
      <AnalyticsView data={data} exportHref={`/api/exports/analytics?${qs.toString()}`} showUsers eventBasePath="/organizer/events" />
    </>
  );
}
