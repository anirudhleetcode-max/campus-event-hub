"use client";

import * as React from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label, Textarea } from "@/components/ui/input";
import { sendEventAnnouncementAction } from "@/app/actions/organizer";
import { announcementSchema } from "@/lib/validators";

/** Sends an in-app (and optionally email) announcement to confirmed participants. */
export function AnnouncementForm({ eventId, participantCount }: { eventId: string; participantCount: number }) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sendEmail, setSendEmail] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const id = React.useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = announcementSchema.safeParse({ title, body, sendEmail, audience: "EVENT_PARTICIPANTS", eventId });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setPending(true);
    setErrors({});
    try {
      const res = await sendEventAnnouncementAction(eventId, { title: parsed.data.title, body: parsed.data.body, sendEmail });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(`Announcement sent to ${res.data.recipients} participant${res.data.recipients === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
      setSendEmail(false);
    } catch {
      toast.error("Something went wrong while sending. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor={`${id}-title`} error={errors.title} required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Venue change for Day 2" />
      </Field>
      <Field label="Message" htmlFor={`${id}-body`} error={errors.body} required>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-email`} checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          <Label htmlFor={`${id}-email`} className="font-normal">
            Also send by email
          </Label>
        </div>
        <Button type="submit" loading={pending} disabled={participantCount === 0}>
          <Send /> Send to {participantCount} participant{participantCount === 1 ? "" : "s"}
        </Button>
      </div>
    </form>
  );
}
