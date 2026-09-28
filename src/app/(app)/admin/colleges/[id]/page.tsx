import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageUser } from "@/server/page-guard";
import { getCollege } from "@/server/services/institutions";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CollegeForm } from "../../_components/college-form";
import { CollegeStatusControl, SubscriptionForm } from "../../_components/college-admin-controls";

export const metadata: Metadata = { title: "College profile" };

export default async function CollegePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const { id } = await params;
  const college = await getCollege(user, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [users, events, departments] = await Promise.all([
    db.user.count({ where: { collegeId: id, deletedAt: null } }),
    db.event.count({ where: { collegeId: id, deletedAt: null } }),
    db.department.count({ where: { collegeId: id, deletedAt: null } }),
  ]);
  const isSuper = user.role === "SUPER_ADMIN";
  return (
    <>
      <PageHeader
        title={college.name}
        description={
          <span className="inline-flex items-center gap-2">
            <Badge tone={college.status === "ACTIVE" ? "success" : "danger"} dot>
              {college.status === "ACTIVE" ? "Active" : "Suspended"}
            </Badge>
            {college.subscription && <Badge tone="primary">{college.subscription.plan} plan</Badge>}
          </span>
        }
        breadcrumbs={isSuper ? [{ label: "Colleges", href: "/admin/colleges" }, { label: college.shortName ?? college.name }] : undefined}
        actions={isSuper ? <CollegeStatusControl id={college.id} name={college.name} status={college.status} /> : undefined}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Users" value={users} />
        <StatCard label="Events" value={events} />
        <StatCard label="Departments" value={departments} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>College profile</CardTitle>
            <CardDescription>Shown on event pages and printed on certificates.</CardDescription>
          </CardHeader>
          <CardContent>
            <CollegeForm
              id={college.id}
              initial={{
                name: college.name, shortName: college.shortName ?? "", city: college.city ?? "", state: college.state ?? "", website: college.website ?? "",
                contactEmail: college.contactEmail ?? "", logoUrl: college.logoUrl ?? "", requireEventApproval: college.requireEventApproval,
                signatoryName: college.signatoryName ?? "", signatoryTitle: college.signatoryTitle ?? "",
              }}
            />
          </CardContent>
        </Card>
        {isSuper && college.subscription && (
          <Card className="self-start">
            <CardHeader>
              <CardTitle>Subscription</CardTitle>
              <CardDescription>Plan and limits for this institution.</CardDescription>
            </CardHeader>
            <CardContent>
              <SubscriptionForm collegeId={college.id} initial={{ plan: college.subscription.plan, status: college.subscription.status, eventLimit: college.subscription.eventLimit }} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
