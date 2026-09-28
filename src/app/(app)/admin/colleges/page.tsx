import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { pageUser, sp, type SearchParams } from "@/server/page-guard";
import { listColleges } from "@/server/services/institutions";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/url-controls";

export const metadata: Metadata = { title: "Colleges" };

export default async function CollegesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  if (user.role === "COLLEGE_ADMIN") redirect(`/admin/colleges/${user.collegeId}`);
  const params = await searchParams;
  const colleges = await listColleges(user, sp(params, "q"));
  return (
    <>
      <PageHeader
        title="Colleges"
        description="Institutions using the platform, their plans and usage."
        actions={
          <Link href="/admin/colleges/new" className={buttonClasses("primary")}>
            <Plus /> Add college
          </Link>
        }
      />
      <Card>
        <div className="border-b border-border p-4">
          <SearchInput placeholder="Search colleges" className="sm:max-w-sm" label="Search colleges" />
        </div>
        {colleges.length === 0 ? (
          <EmptyState icon={Building2} title="No colleges found" description="Add the first institution to get started." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>College</TH>
                <TH>Status</TH>
                <TH>Plan</TH>
                <TH className="text-right">Users</TH>
                <TH className="text-right">Events</TH>
                <TH className="text-right">Departments</TH>
              </tr>
            </THead>
            <TBody>
              {colleges.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/admin/colleges/${c.id}`} className="font-medium hover:text-primary">
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</p>
                  </TD>
                  <TD>
                    <Badge tone={c.status === "ACTIVE" ? "success" : "danger"} dot>
                      {c.status === "ACTIVE" ? "Active" : "Suspended"}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={c.subscription?.plan === "FREE" ? "neutral" : "primary"}>{c.subscription?.plan ?? "FREE"}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{c._count.users}</TD>
                  <TD className="text-right tabular-nums">{c._count.events}</TD>
                  <TD className="text-right tabular-nums">{c._count.departments}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
