import type { Metadata } from "next";
import { Users } from "lucide-react";
import type { Role } from "@prisma/client";
import { pageUser, pageNum, sp, type SearchParams } from "@/server/page-guard";
import { listUsers } from "@/server/services/users";
import { assignableRoles } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PageHeader, EmptyState, Avatar } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput, UrlSelect } from "@/components/ui/url-controls";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDate, relativeTime } from "@/lib/utils";
import { UserActions } from "../_components/user-actions";
import { CreateUserDialog } from "../_components/create-user-dialog";

export const metadata: Metadata = { title: "Users" };

const STATUS_TONE = { ACTIVE: "success", SUSPENDED: "danger", DEACTIVATED: "neutral" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const collegeFilter = user.role === "SUPER_ADMIN" ? sp(params, "college") : undefined;
  const [data, colleges, departments] = await Promise.all([
    listUsers(user, { q: sp(params, "q"), role: sp(params, "role"), status: sp(params, "status"), collegeId: collegeFilter, page: pageNum(params) }),
    user.role === "SUPER_ADMIN" ? db.college.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.department.findMany({ where: { deletedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { collegeId: user.collegeId ?? "" }) }, orderBy: { name: "asc" }, select: { id: true, name: true, collegeId: true } }),
  ]);
  const assignable = assignableRoles(user);
  const roleOptions = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  return (
    <>
      <PageHeader
        title="Users"
        description={`${data.total.toLocaleString("en-IN")} ${data.total === 1 ? "account" : "accounts"}${user.role === "COLLEGE_ADMIN" ? ` at ${user.collegeName}` : " across the platform"}`}
        actions={<CreateUserDialog roles={assignable} colleges={colleges} departments={departments} fixedCollegeId={user.role === "SUPER_ADMIN" ? null : user.collegeId} />}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <SearchInput placeholder="Search name, email or student ID" className="lg:max-w-sm lg:flex-1" label="Search users" />
          <div className="flex flex-wrap gap-2">
            <UrlSelect param="role" label="Filter by role" options={roleOptions} allLabel="All roles" />
            <UrlSelect param="status" label="Filter by status" options={[{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }, { value: "DEACTIVATED", label: "Deactivated" }]} allLabel="Any status" />
            {user.role === "SUPER_ADMIN" && <UrlSelect param="college" label="Filter by college" options={colleges.map((c) => ({ value: c.id, label: c.name }))} allLabel="All colleges" />}
          </div>
        </div>
        {data.items.length === 0 ? (
          <EmptyState icon={Users} title="No users match these filters" description="Try a different search term or clear the filters." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>User</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH className="hidden md:table-cell">College / department</TH>
                <TH className="hidden lg:table-cell">Activity</TH>
                <TH className="hidden lg:table-cell">Last sign-in</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="flex min-w-48 items-center gap-3">
                      <Avatar name={u.name} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={u.role === "STUDENT" ? "neutral" : "primary"}>{ROLE_LABEL[u.role]}</Badge>
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[u.status]} dot>
                      {u.status.charAt(0) + u.status.slice(1).toLowerCase()}
                    </Badge>
                  </TD>
                  <TD className="hidden text-muted-foreground md:table-cell">
                    <p className="truncate">{u.college?.shortName ?? u.college?.name ?? "Platform"}</p>
                    {u.department && <p className="truncate text-xs">{u.department.name}</p>}
                  </TD>
                  <TD className="hidden text-muted-foreground lg:table-cell">
                    {u.role === "STUDENT" ? `${u._count.registrations} registrations` : `${u._count.organizedEvents} events`}
                  </TD>
                  <TD className="hidden text-muted-foreground lg:table-cell" title={u.lastLoginAt ? formatDate(u.lastLoginAt) : undefined}>
                    {u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"}
                  </TD>
                  <TD>
                    <UserActions user={u} assignable={assignable} isSelf={u.id === user.id} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <div className="border-t border-border p-4">
          <Pagination page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} basePath="/admin/users" searchParams={params} />
        </div>
      </Card>
    </>
  );
}
