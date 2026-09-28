import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { pageUser, sp, type SearchParams } from "@/server/page-guard";
import { listDepartments } from "@/server/services/institutions";
import { db } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { UrlSelect } from "@/components/ui/url-controls";
import { DeleteDepartmentButton, DepartmentDialog } from "../_components/department-manager";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const params = await searchParams;
  const colleges =
    user.role === "SUPER_ADMIN"
      ? await db.college.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [{ id: user.collegeId!, name: user.collegeName ?? "Your college" }];
  const collegeId = user.role === "SUPER_ADMIN" ? sp(params, "college") : user.collegeId ?? undefined;
  const departments = await listDepartments(user, collegeId);
  return (
    <>
      <PageHeader
        title="Departments"
        description="Departments organise events, students and participation analytics."
        actions={
          <>
            {user.role === "SUPER_ADMIN" && <UrlSelect param="college" label="Filter by college" options={colleges.map((c) => ({ value: c.id, label: c.name }))} allLabel="All colleges" />}
            {colleges.length > 0 && <DepartmentDialog colleges={colleges} defaultCollegeId={collegeId ?? colleges[0]!.id} />}
          </>
        }
      />
      <Card>
        {departments.length === 0 ? (
          <EmptyState icon={Layers} title="No departments yet" description="Add departments so organizers and students can select them." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Department</TH>
                <TH>Code</TH>
                {user.role === "SUPER_ADMIN" && <TH>College</TH>}
                <TH className="text-right">Users</TH>
                <TH className="text-right">Events</TH>
                <TH className="text-right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {departments.map((d) => (
                <TR key={d.id}>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="font-mono text-xs">{d.code}</TD>
                  {user.role === "SUPER_ADMIN" && <TD className="text-muted-foreground">{d.college.shortName ?? d.college.name}</TD>}
                  <TD className="text-right tabular-nums">{d._count.users}</TD>
                  <TD className="text-right tabular-nums">{d._count.events}</TD>
                  <TD>
                    <div className="flex justify-end">
                      <DepartmentDialog dept={d} colleges={colleges} defaultCollegeId={d.collegeId} />
                      <DeleteDepartmentButton id={d.id} name={d.name} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
