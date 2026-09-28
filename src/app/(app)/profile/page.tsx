import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award, CalendarCheck2, MessageSquareText, Ticket } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getProfile } from "@/server/services/users";
import { publicDepartments } from "@/server/services/institutions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, DescriptionList, PageHeader, StatCard } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/student/profile-form";
import { ChangePasswordForm } from "@/components/student/password-form";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };

async function studentStats(userId: string) {
  const [registered, attended, certificates, feedback] = await Promise.all([
    db.registration.count({ where: { userId, status: "CONFIRMED" } }),
    db.attendance.count({ where: { userId } }),
    db.certificate.count({ where: { userId, status: "ISSUED" } }),
    db.feedback.count({ where: { userId } }),
  ]);
  return { registered, attended, certificates, feedback };
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isStudent = user.role === "STUDENT";
  const [profile, departments, stats] = await Promise.all([
    getProfile(user),
    user.collegeId ? publicDepartments(user.collegeId) : Promise.resolve([]),
    isStudent ? studentStats(user.id) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title="Profile" description="Manage your personal details, photo and password." />

      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Registered events" value={formatNumber(stats.registered)} icon={Ticket} />
          <StatCard label="Attended" value={formatNumber(stats.attended)} icon={CalendarCheck2} />
          <StatCard label="Certificates" value={formatNumber(stats.certificates)} icon={Award} />
          <StatCard label="Feedback given" value={formatNumber(stats.feedback)} icon={MessageSquareText} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
              <CardDescription>{isStudent ? "These details pre-fill your event registrations." : "Shown to colleagues and on event pages you manage."}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm
                isStudent={isStudent}
                departments={departments}
                initial={{
                  name: profile.name,
                  phone: profile.phone ?? "",
                  departmentId: profile.departmentId ?? "",
                  year: profile.year ? String(profile.year) : "",
                  studentId: profile.studentId ?? "",
                  interests: profile.interests,
                  avatarUrl: profile.avatarUrl ?? "",
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Changing your password signs you out of your other devices.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </div>

        <aside>
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center sm:pt-6">
              <Avatar name={profile.name} src={profile.avatarUrl} size={72} />
              <div className="min-w-0">
                <p className="text-base font-semibold break-words">{profile.name}</p>
                <p className="text-sm break-all text-muted-foreground">{profile.email}</p>
              </div>
              <Badge tone="primary">{ROLE_LABEL[profile.role]}</Badge>
            </CardContent>
            <CardContent>
              <DescriptionList
                items={[
                  { label: "Email", value: <span className="break-all">{profile.email}</span> },
                  { label: "Role", value: ROLE_LABEL[profile.role] },
                  { label: "College", value: profile.college?.name ?? "Platform" },
                  ...(profile.department ? [{ label: "Department", value: profile.department.name }] : []),
                  { label: "Member since", value: formatDate(profile.createdAt) },
                ]}
              />
              <p className="mt-3 text-xs text-muted-foreground">To change your email, college or role, contact your college administrator.</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
