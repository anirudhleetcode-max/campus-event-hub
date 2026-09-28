import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { MessageSquareText } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getMyRegistration } from "@/server/services/registrations";
import { feedbackEligibility } from "@/server/services/feedback";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { FeedbackForm } from "@/components/student/feedback-form";
import { formatDateRange } from "@/lib/utils";

export const metadata: Metadata = { title: "Event feedback" };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!z.uuid().safeParse(id).success) notFound();
  let reg: Awaited<ReturnType<typeof getMyRegistration>>;
  try {
    reg = await getMyRegistration(user, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const eligibility = await feedbackEligibility(user.id, reg.event.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Share your feedback"
        breadcrumbs={[
          { label: "My registrations", href: "/my/registrations" },
          { label: reg.event.title, href: `/my/registrations/${reg.id}` },
          { label: "Feedback" },
        ]}
        description={`${reg.event.title} · ${formatDateRange(reg.event.startsAt, reg.event.endsAt)}`}
      />
      {eligibility.eligible ? (
        <Card>
          <CardHeader>
            <CardTitle>Rate your experience</CardTitle>
            <CardDescription>All ratings are on a scale of 1 (poor) to 5 (excellent). Your feedback is shared with the organizers.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeedbackForm eventId={reg.event.id} registrationId={reg.id} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={MessageSquareText}
            title="Feedback isn't available"
            description={eligibility.reason}
            action={
              <Link href={`/my/registrations/${reg.id}`} className={buttonClasses("outline")}>
                Back to registration
              </Link>
            }
          />
        </Card>
      )}
    </div>
  );
}
