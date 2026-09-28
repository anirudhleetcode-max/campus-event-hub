import Link from "next/link";
import type { Role } from "@prisma/client";
import { CalendarDays } from "lucide-react";
import type { listStaffEvents } from "@/server/services/events";
import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { EventStatusBadge } from "@/components/ui/status-badges";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { EDITABLE_STATUSES } from "@/lib/event-status";
import { EVENT_STATUS } from "@/lib/labels";
import { formatDate, formatNumber, formatPercent, formatTime } from "@/lib/utils";
import { EventRowActions } from "./event-status-actions";
import { formatAmount } from "./format";

export type StaffEventList = Awaited<ReturnType<typeof listStaffEvents>>;

const STATUS_OPTIONS = Object.entries(EVENT_STATUS).map(([value, s]) => ({ value, label: s.label }));

/**
 * Event management table (search, status filter, pagination, row actions).
 * Shared by /organizer/events and /admin/events. Row actions are shown per
 * the viewer's role; the server re-checks every action.
 */
export async function EventTable({
  data,
  basePath,
  searchParams,
  showCollege = false,
  viewer,
  emptyAction,
}: {
  data: StaffEventList;
  basePath: string;
  searchParams: Record<string, string | string[] | undefined>;
  showCollege?: boolean;
  /** The signed-in user; faculty coordinators get a read-only table. */
  viewer?: { role: Role };
  emptyAction?: React.ReactNode;
}) {
  const role = viewer?.role;
  const readOnly = role === "FACULTY_COORDINATOR";
  const canApprove = role === "SUPER_ADMIN" || role === "COLLEGE_ADMIN";
  const canCreate = role === "SUPER_ADMIN" || role === "COLLEGE_ADMIN" || role === "EVENT_ORGANIZER";
  const ids = data.items.map((e) => e.id);
  const approvalRows = ids.length
    ? await db.event.findMany({ where: { id: { in: ids } }, select: { id: true, college: { select: { requireEventApproval: true } } } })
    : [];
  const requireApproval = new Map(approvalRows.map((r) => [r.id, r.college.requireEventApproval]));
  const filtered = Boolean(searchParams.q || searchParams.status);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search events…" label="Search events" className="sm:max-w-xs sm:flex-1" />
        <UrlSelect param="status" label="Filter by status" options={STATUS_OPTIONS} allLabel="All statuses" />
      </div>
      {data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={filtered ? "No events match your filters" : "No events yet"}
          description={filtered ? "Try a different search or status." : "Events you organise or are assigned to will appear here."}
          action={filtered ? undefined : emptyAction}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Status</TH>
              <TH>Date</TH>
              <TH className="text-right">Registrations</TH>
              <TH className="text-right">Capacity</TH>
              <TH className="text-right">Revenue</TH>
              <TH className="text-right">Attendance</TH>
              <TH className="w-12">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {data.items.map((e) => {
              const fill = e.capacity ? e.registrations / e.capacity : 0;
              return (
                <TR key={e.id}>
                  <TD className="max-w-[22rem] min-w-[14rem]">
                    <Link href={`/organizer/events/${e.id}`} className="line-clamp-2 font-medium text-foreground hover:text-primary">
                      {e.title}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: e.category.color }} aria-hidden />
                      {e.category.name}
                      {showCollege && <> · {e.college.shortName ?? e.college.name}</>}
                      {role !== "EVENT_ORGANIZER" && <> · {e.organizer.name}</>}
                    </p>
                  </TD>
                  <TD>
                    <EventStatusBadge status={e.status} />
                  </TD>
                  <TD className="whitespace-nowrap">
                    <p>{formatDate(e.startsAt, { day: "numeric", month: "short", year: "numeric" })}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(e.startsAt)}</p>
                  </TD>
                  <TD className="text-right tabular-nums">
                    <p>{formatNumber(e.registrations)}</p>
                    <Progress value={fill} className="mt-1 ml-auto h-1.5 w-16" label={`${formatPercent(fill)} full`} tone={fill >= 1 ? "danger" : fill > 0.85 ? "warning" : "primary"} />
                  </TD>
                  <TD className="text-right tabular-nums">{formatNumber(e.capacity)}</TD>
                  <TD className="text-right whitespace-nowrap tabular-nums">{e.feeAmount === 0 && e.revenue === 0 ? <span className="text-muted-foreground">Free</span> : formatAmount(e.revenue)}</TD>
                  <TD className="text-right tabular-nums">
                    {formatNumber(e.attendance)}
                    {e.registrations > 0 && <span className="ml-1 text-xs text-muted-foreground">({formatPercent(e.attendance / e.registrations)})</span>}
                  </TD>
                  <TD className="text-right">
                    <EventRowActions
                      eventId={e.id}
                      title={e.title}
                      status={e.status}
                      editable={EDITABLE_STATUSES.includes(e.status)}
                      canManage={!readOnly}
                      canApprove={canApprove}
                      canCreate={canCreate}
                      requireApproval={requireApproval.get(e.id) ?? true}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      {data.total > 0 && (
        <div className="border-t border-border p-4">
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath={basePath} searchParams={searchParams} />
        </div>
      )}
    </Card>
  );
}
