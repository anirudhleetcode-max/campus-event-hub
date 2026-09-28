import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageUser } from "@/server/page-guard";
import { getUserActivity } from "@/server/services/users";
import { AppError } from "@/server/errors";
import { PageHeader, DescriptionList, Avatar } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EventStatusBadge, RegistrationStatusBadge } from "@/components/ui/status-badges";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDate, formatDateTime, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "User activity" };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await pageUser(["SUPER_ADMIN", "COLLEGE_ADMIN"]);
  const { id } = await params;
  const data = await getUserActivity(actor, id).catch((e) => {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  });
  const { user, logs } = data;
  return (
    <>
      <PageHeader title={user.name} description={user.email} breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: user.name }]} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={user.name} size={48} />
              <div>
                <Badge tone="primary">{ROLE_LABEL[user.role]}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">Joined {formatDate(user.createdAt)}</p>
              </div>
            </div>
            <DescriptionList
              items={[
                { label: "Status", value: user.status },
                { label: "College", value: user.college?.name ?? "Platform" },
                { label: "Department", value: user.department?.name ?? "—" },
                { label: "Student ID", value: user.studentId ?? "—" },
                { label: "Year", value: user.year ?? "—" },
                { label: "Phone", value: user.phone ?? "—" },
                { label: "Last sign-in", value: user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never" },
              ]}
            />
          </CardContent>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          {user.registrations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent registrations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {user.registrations.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.code} · {formatDate(r.createdAt)}
                        </p>
                      </div>
                      <RegistrationStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {user.organizedEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Organized events</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {user.organizedEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <Link href={`/organizer/events/${e.id}`} className="truncate font-medium hover:text-primary">
                        {e.title}
                      </Link>
                      <EventStatusBadge status={e.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Activity log</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No recorded activity.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {logs.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="font-mono text-xs">{l.action}</span>
                      <time className="text-xs text-muted-foreground" dateTime={l.createdAt.toISOString()} title={formatDateTime(l.createdAt)}>
                        {relativeTime(l.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
