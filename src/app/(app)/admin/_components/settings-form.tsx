"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label } from "@/components/ui/input";
import { settingsSchema } from "@/lib/validators";
import { zodErrors } from "@/lib/form";
import { saveSettingsAction } from "@/app/actions/admin";

type Values = { platformName: string; supportEmail: string; seatHoldMinutes: string; reminderOffsetsHours: string; allowStudentSignup: boolean; maintenanceBanner: string };

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof Values, val: string | boolean) => (setV((p) => ({ ...p, [k]: val })), setErrors((e) => ({ ...e, [k]: "" })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = settingsSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setPending(true);
    const res = await saveSettingsAction(v);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return toast.error(res.error);
    }
    toast.success(res.message);
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Platform name" htmlFor="set-name" error={errors.platformName} required>
          <Input value={v.platformName} onChange={(e) => set("platformName", e.target.value)} />
        </Field>
        <Field label="Support email" htmlFor="set-email" error={errors.supportEmail} required>
          <Input type="email" value={v.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
        </Field>
        <Field label="Seat hold duration (minutes)" htmlFor="set-hold" error={errors.seatHoldMinutes} hint="How long an unpaid registration reserves a seat (5–60)." required>
          <Input type="number" min={5} max={60} value={v.seatHoldMinutes} onChange={(e) => set("seatHoldMinutes", e.target.value)} />
        </Field>
        <Field label="Reminder schedule (hours before start)" htmlFor="set-reminders" error={errors.reminderOffsetsHours} hint="Comma separated, e.g. 168, 24, 1 (7 days, 24 hours, 1 hour)." required>
          <Input value={v.reminderOffsetsHours} onChange={(e) => set("reminderOffsetsHours", e.target.value)} />
        </Field>
      </div>
      <Field label="Maintenance banner" htmlFor="set-banner" error={errors.maintenanceBanner} hint="Optional message shown to signed-in users.">
        <Input value={v.maintenanceBanner} onChange={(e) => set("maintenanceBanner", e.target.value)} maxLength={200} />
      </Field>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/50 p-4">
        <Checkbox id="set-signup" checked={v.allowStudentSignup} onChange={(e) => set("allowStudentSignup", e.target.checked)} className="mt-0.5" />
        <div>
          <Label htmlFor="set-signup">Allow students to sign up themselves</Label>
          <p className="text-xs text-muted-foreground">When disabled, only administrators can create accounts.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
