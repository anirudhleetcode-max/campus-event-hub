import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, Star } from "lucide-react";
import { db } from "@/server/db";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/url-controls";
import { formatDate, formatNumber } from "@/lib/utils";
import { pageParam, param, requireStaff } from "@/app/(app)/organizer/_lib/guard";
import { scopedEventPage } from "@/app/(app)/organizer/_lib/event-hub";

export const metadata: Metadata = { title: "Feedback" };

export default async function OrganizerFeedbackPage({ searchParams }: PageProps<"/organizer/feedback">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = param(sp.q);
  const data = await scopedEventPage(user, { q, page: pageParam(sp.page), where: { status: { in: ["ONGOING", "COMPLETED", "ARCHIVED"] } } });
  const ids = data.items.map((e) => e.id);
  const stats = ids.length
    ? await db.feedback.groupBy({ by: ["eventId"], where: { eventId: { in: ids } }, _avg: { overall: true, organization: true, venue: true }, _count: { _all: true } })
    : [];
  const byEvent = new Map(stats.map((s) => [s.eventId, s]));

  return (
    <>
      <PageHeader title="Feedback" description="How participants rated your events." />
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput placeholder="Search events…" label="Search events" className="sm:max-w-xs" />
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={MessageSquareText} title={q ? "No events match your search" : "No feedback yet"} description="Participants are asked for feedback after each event ends." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Status</TH>
                <TH className="text-right">Responses</TH>
                <TH>Overall</TH>
                <TH className="text-right">Organization</TH>
                <TH className="text-right">Venue</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((e) => {
                const s = byEvent.get(e.id);
                const overall = s?._avg.overall ?? null;
                return (
                  <TR key={e.id}>
                    <TD className="max-w-[22rem] min-w-[14rem]">
                      <Link href={`/organizer/events/${e.id}/feedback`} className="line-clamp-2 font-medium hover:text-primary">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatDate(e.startsAt)}</p>
                    </TD>
                    <TD>
                      <EventStatusBadge status={e.status} />
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(s?._count._all ?? 0)}</TD>
                    <TD className="whitespace-nowrap">
                      {overall === null ? (
                        <span className="text-xs text-muted-foreground">No ratings</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                          <Star className="size-4 fill-current text-warning" aria-hidden /> {overall.toFixed(1)}
                        </span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{s?._avg.organization?.toFixed(1) ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{s?._avg.venue?.toFixed(1) ?? "—"}</TD>
                    <TD className="text-right">
                      <Link href={`/organizer/events/${e.id}/feedback`} className={buttonClasses("ghost", "sm")}>
                        View
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {data.total > 0 && (
          <div className="border-t border-border p-4">
            <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath="/organizer/feedback" searchParams={sp} />
          </div>
        )}
      </Card>
    </>
  );
}
