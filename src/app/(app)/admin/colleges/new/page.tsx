import type { Metadata } from "next";
import { pageUser } from "@/server/page-guard";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { CollegeForm } from "../../_components/college-form";

export const metadata: Metadata = { title: "Add college" };

export default async function NewCollegePage() {
  await pageUser(["SUPER_ADMIN"]);
  return (
    <>
      <PageHeader title="Add a college" breadcrumbs={[{ label: "Colleges", href: "/admin/colleges" }, { label: "New" }]} />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <CollegeForm
            id={null}
            initial={{ name: "", shortName: "", city: "", state: "", website: "", contactEmail: "", logoUrl: "", requireEventApproval: true, signatoryName: "", signatoryTitle: "" }}
          />
        </CardContent>
      </Card>
    </>
  );
}
