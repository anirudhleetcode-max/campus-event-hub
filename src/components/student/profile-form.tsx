"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { ImageUpload } from "@/components/ui/image-upload";
import { profileSchema } from "@/lib/validators";
import { updateProfileAction } from "@/app/actions/student";

export type ProfileFormValues = {
  name: string;
  phone: string;
  departmentId: string;
  year: string;
  studentId: string;
  interests: string[];
  avatarUrl: string;
};

const MAX_INTERESTS = 12;

function InterestsInput({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [draft, setDraft] = React.useState("");
  function add(raw: string) {
    const parts = raw.split(",").map((p) => p.trim().toLowerCase().slice(0, 30)).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p) && next.length < MAX_INTERESTS) next.push(p);
    onChange(next);
    setDraft("");
  }
  return (
    <div className="space-y-2">
      <Field label="Interests" htmlFor="interests" error={error} hint={`Press Enter or comma to add · up to ${MAX_INTERESTS}. Used to recommend events.`}>
        <Input
          value={draft}
          placeholder={value.length >= MAX_INTERESTS ? "Maximum reached" : "e.g. robotics, music, design"}
          disabled={value.length >= MAX_INTERESTS}
          maxLength={200}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(draft)}
        />
      </Field>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected interests">
          {value.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pr-1 pl-2.5 text-xs font-medium text-primary-soft-foreground">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="rounded-full p-0.5 hover:bg-primary/15"
                aria-label={`Remove ${tag}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProfileForm({ initial, departments, isStudent }: { initial: ProfileFormValues; departments: { id: string; name: string }[]; isStudent: boolean }) {
  const router = useRouter();
  const [values, setValues] = React.useState<ProfileFormValues>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const set = <K extends keyof ProfileFormValues>(k: K, v: ProfileFormValues[K]) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || uploading) return;
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? "_form");
        if (!fe[k]) fe[k] = issue.message;
      }
      setErrors(fe);
      toast.error("Please correct the highlighted fields.");
      return;
    }
    setPending(true);
    const res = await updateProfileAction({ ...values });
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Profile updated.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <ImageUpload
        kind="avatar"
        label="Profile photo"
        value={values.avatarUrl}
        onChange={(url) => set("avatarUrl", url)}
        onUploadingChange={setUploading}
        error={errors.avatarUrl}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={errors.name} required>
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" maxLength={100} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone} hint="Used by organizers to contact you about events.">
          <Input type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="tel" inputMode="tel" maxLength={16} placeholder="+91 98765 43210" />
        </Field>
        {departments.length > 0 && (
          <Field label="Department" htmlFor="departmentId" error={errors.departmentId}>
            <Select value={values.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
              <option value="">Not specified</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {isStudent && (
          <>
            <Field label="Year of study" htmlFor="year" error={errors.year}>
              <Select value={values.year} onChange={(e) => set("year", e.target.value)}>
                <option value="">Not specified</option>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={String(y)}>
                    Year {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Student ID / Roll number" htmlFor="studentId" error={errors.studentId}>
              <Input value={values.studentId} onChange={(e) => set("studentId", e.target.value)} maxLength={40} />
            </Field>
          </>
        )}
      </div>
      <InterestsInput value={values.interests} onChange={(v) => set("interests", v)} error={errors.interests} />
      <div className="flex justify-end">
        <Button type="submit" loading={pending} disabled={uploading}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
