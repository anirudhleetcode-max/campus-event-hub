import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { pageUser } from "@/server/page-guard";
import { listAnnouncements } from "@/server/services/communications";
import { staffEventScope } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { AnnouncementForm } from "../_components/announcement-form";

export const metadata: Metadata = { title: "Announcements" };

const AUDIENCE_LABEL: Record<string, string> = { ALL_STUDENTS: "All students", ALL_USERS: "Everyone", STAFF: "Staff", EVENT_PARTICIPANTS: "Event participants" };

export default async function AnnouncementsPage() {
  const user = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const [history, events, colleges] = await Promise.all([
    listAnnouncements(user),
    db.event.findMany({
      where: { AND: [staffEventScope(user), { status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING", "COMPLETED"] } }] },
      orderBy: { startsAt: "desc" },
      take: 100,
      select: { id: true, title: true },
    }),
    user.role === "SUPER_ADMIN" ? db.college.findMany({ where: { deletedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title="Announcements" description="Send in-app notifications (and optional emails) to students, staff or event participants." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="self-start lg:col-span-2">
          <CardHeader>
            <CardTitle>New announcement</CardTitle>
            <CardDescription>Recipients see it instantly in their notification centre.</CardDescription>
          </CardHeader>
          <CardContent>
            <AnnouncementForm events={events} colleges={colleges} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Sent announcements</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <EmptyState icon={Megaphone} title="Nothing sent yet" description="Your announcements will be listed here." className="py-8" />
            ) : (
              <ul className="divide-y divide-border">
                {history.map((a) => (
                  <li key={a.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{a.title}</p>
                      <Badge>{AUDIENCE_LABEL[a.audience] ?? a.audience}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{a.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {a.author.name} · {formatDateTime(a.createdAt)} · {a.recipientCount.toLocaleString("en-IN")} recipients
                      {a.event ? ` · ${a.event.title}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
