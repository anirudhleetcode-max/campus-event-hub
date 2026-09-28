import type { Metadata } from "next";
import { FileClock } from "lucide-react";
import { pageUser, pageNum, sp, type SearchParams } from "@/server/page-guard";
import { listAuditLogs } from "@/server/services/institutions";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit logs" };

const ACTION_GROUPS = [
  { value: "auth.", label: "Authentication" },
  { value: "event.", label: "Events" },
  { value: "registration.", label: "Registrations" },
  { value: "payment.", label: "Payments" },
  { value: "attendance.", label: "Attendance" },
  { value: "certificate.", label: "Certificates" },
  { value: "user.", label: "Users & roles" },
  { value: "college.", label: "Colleges" },
  { value: "settings.", label: "Settings" },
  { value: "export.", label: "Exports" },
];

function tone(action: string) {
  if (/failed|invalid|suspended|revoked|cancel|removed|refund/.test(action)) return "warning" as const;
  if (/created|approve|issued|captured|login$/.test(action)) return "success" as const;
  return "neutral" as const;
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const data = await listAuditLogs(user, { q: sp(params, "q"), action: sp(params, "action"), page: pageNum(params) });
  return (
    <>
      <PageHeader title="Audit logs" description="An immutable record of important actions: sign-ins, event changes, payments, attendance, certificates and role changes." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <SearchInput placeholder="Search by user, action or entity ID" className="sm:max-w-sm sm:flex-1" label="Search audit logs" />
          <UrlSelect param="action" label="Action type" options={ACTION_GROUPS} allLabel="All actions" />
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={FileClock} title="No matching entries" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Time</TH>
                <TH>User</TH>
                <TH>Action</TH>
                <TH className="hidden md:table-cell">Entity</TH>
                <TH className="hidden lg:table-cell">Details</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(l.createdAt)}</TD>
                  <TD>
                    <p className="font-medium whitespace-nowrap">{l.actor?.name ?? "System"}</p>
                    {l.actor && <p className="text-xs text-muted-foreground">{ROLE_LABEL[l.actor.role]}</p>}
                  </TD>
                  <TD>
                    <Badge tone={tone(l.action)} className="font-mono">
                      {l.action}
                    </Badge>
                  </TD>
                  <TD className="hidden text-xs text-muted-foreground md:table-cell">
                    <p>{l.entityType}</p>
                    {l.entityId && <p className="font-mono">{l.entityId.slice(0, 8)}…</p>}
                  </TD>
                  <TD className="hidden max-w-xs lg:table-cell">
                    {l.metadata ? <code className="line-clamp-2 text-xs break-all text-muted-foreground">{JSON.stringify(l.metadata)}</code> : <span className="text-muted-foreground">—</span>}
                    {l.ipAddress && <p className="text-xs text-muted-foreground">IP {l.ipAddress}</p>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="border-t border-border p-4">
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath="/admin/audit-logs" searchParams={params} />
        </div>
      </Card>
    </>
  );
}
