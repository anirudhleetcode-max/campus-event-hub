"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/input";
import { announcementSchema } from "@/lib/validators";
import { zodErrors } from "@/lib/form";
import { sendAnnouncementAction } from "@/app/actions/admin";

const AUDIENCES = [
  { value: "ALL_STUDENTS", label: "All students" },
  { value: "ALL_USERS", label: "Everyone (students and staff)" },
  { value: "STAFF", label: "Staff only (admins, organizers, faculty)" },
  { value: "EVENT_PARTICIPANTS", label: "Participants of an event" },
];

export function AnnouncementForm({ events, colleges }: { events: { id: string; title: string }[]; colleges: { id: string; name: string }[] | null }) {
  const router = useRouter();
  const [v, setV] = useState({ title: "", body: "", audience: "ALL_STUDENTS", eventId: "", collegeId: "", sendEmail: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v, val: string | boolean) => (setV((p) => ({ ...p, [k]: val })), setErrors((e) => ({ ...e, [k]: "" })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = announcementSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    if (v.audience === "EVENT_PARTICIPANTS" && !v.eventId) return setErrors({ eventId: "Select an event" });
    setPending(true);
    const res = await sendAnnouncementAction(v);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return toast.error(res.error);
    }
    toast.success(`Announcement delivered to ${res.data.recipients.toLocaleString("en-IN")} people.`);
    setV((p) => ({ ...p, title: "", body: "" }));
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Audience" htmlFor="ann-audience" required>
        <Select value={v.audience} onChange={(e) => set("audience", e.target.value)}>
          {AUDIENCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      {v.audience === "EVENT_PARTICIPANTS" ? (
        <Field label="Event" htmlFor="ann-event" error={errors.eventId} required>
          <Select value={v.eventId} onChange={(e) => set("eventId", e.target.value)}>
            <option value="">Select an event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        colleges && (
          <Field label="College" htmlFor="ann-college" hint="Leave empty to reach every college on the platform.">
            <Select value={v.collegeId} onChange={(e) => set("collegeId", e.target.value)}>
              <option value="">All colleges</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )
      )}
      <Field label="Title" htmlFor="ann-title" error={errors.title} required>
        <Input value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={120} />
      </Field>
      <Field label="Message" htmlFor="ann-body" error={errors.body} required>
        <Textarea value={v.body} onChange={(e) => set("body", e.target.value)} rows={5} maxLength={2000} />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="ann-email" checked={v.sendEmail} onChange={(e) => set("sendEmail", e.target.checked)} />
        <Label htmlFor="ann-email" className="font-normal">
          Also send by email
        </Label>
      </div>
      <Button type="submit" loading={pending} className="w-full sm:w-auto">
        <Send /> Send announcement
      </Button>
    </form>
  );
}
