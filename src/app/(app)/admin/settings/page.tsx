import type { Metadata } from "next";
import { pageUser } from "@/server/page-guard";
import { getSettings } from "@/server/services/settings";
import { razorpayConfigured, razorpayMode, env } from "@/server/env";
import { PageHeader, DescriptionList } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "../_components/settings-form";

export const metadata: Metadata = { title: "Platform settings" };

function Status({ ok, okLabel = "Configured", offLabel = "Not configured" }: { ok: boolean; okLabel?: string; offLabel?: string }) {
  return <Badge tone={ok ? "success" : "warning"} dot>{ok ? okLabel : offLabel}</Badge>;
}

export default async function SettingsPage() {
  await pageUser(["SUPER_ADMIN"]);
  const s = await getSettings();
  const e = env();
  const payments = razorpayConfigured();
  return (
    <>
      <PageHeader title="Platform settings" description="Global configuration for registrations, reminders and sign-up." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent>
            <SettingsForm
              initial={{
                platformName: s.platformName,
                supportEmail: s.supportEmail,
                seatHoldMinutes: String(s.seatHoldMinutes),
                reminderOffsetsHours: s.reminderOffsetsHours.join(", "),
                allowStudentSignup: s.allowStudentSignup,
                maintenanceBanner: s.maintenanceBanner ?? "",
              }}
            />
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Configured through environment variables. Secrets are never shown here.</CardDescription>
          </CardHeader>
          <CardContent>
            <DescriptionList
              items={[
                { label: "Environment", value: <Badge tone={e.APP_ENV === "production" ? "success" : "info"}>{e.APP_ENV}</Badge> },
                { label: "Razorpay", value: <Status ok={payments} okLabel={`${razorpayMode() === "LIVE" ? "Live" : "Test"} mode`} /> },
                { label: "Razorpay webhooks", value: <Status ok={Boolean(e.RAZORPAY_WEBHOOK_SECRET)} /> },
                { label: "Email (Resend)", value: <Status ok={Boolean(e.EMAIL_API_KEY)} /> },
                { label: "Object storage", value: <Status ok={Boolean(e.STORAGE_BUCKET && e.STORAGE_KEY)} offLabel="Local (dev only)" /> },
                { label: "Cron secret", value: <Status ok={Boolean(e.CRON_SECRET)} /> },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
