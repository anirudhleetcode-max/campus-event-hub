"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Label } from "@/components/ui/input";
import { ImageUpload } from "@/components/ui/image-upload";
import { collegeSchema } from "@/lib/validators";
import { zodErrors } from "@/lib/form";
import { saveCollegeAction } from "@/app/actions/admin";

export type CollegeFormValues = {
  name: string; shortName: string; city: string; state: string; website: string; contactEmail: string; logoUrl: string;
  requireEventApproval: boolean; signatoryName: string; signatoryTitle: string;
};

export function CollegeForm({ id, initial }: { id: string | null; initial: CollegeFormValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = <K extends keyof CollegeFormValues>(k: K, val: CollegeFormValues[K]) => (setV((p) => ({ ...p, [k]: val })), setErrors((e) => ({ ...e, [k]: "" })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = collegeSchema.safeParse(v);
    if (!parsed.success) return setErrors(zodErrors(parsed.error));
    setPending(true);
    const res = await saveCollegeAction(id, v);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      return toast.error(res.error);
    }
    toast.success(res.message);
    if (!id) router.push(`/admin/colleges/${res.data.id}`);
    else router.refresh();
  }

  const text = (k: keyof CollegeFormValues, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, required = false) => (
    <Field label={label} htmlFor={`college-${k}`} error={errors[k]} required={required}>
      <Input value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{text("name", "College name", { autoComplete: "organization" }, true)}</div>
        {text("shortName", "Short name", { placeholder: "e.g. NIT Northfield" })}
        {text("contactEmail", "Contact email", { type: "email" })}
        {text("city", "City")}
        {text("state", "State")}
        <div className="sm:col-span-2">{text("website", "Website", { type: "url", placeholder: "https://" })}</div>
      </div>
      <ImageUpload kind="logo" label="College logo" hint="Square PNG or JPG, at least 64×64. Shown on certificates." value={v.logoUrl} onChange={(url) => set("logoUrl", url)} />
      <div className="grid gap-4 sm:grid-cols-2">
        {text("signatoryName", "Certificate signatory")}
        {text("signatoryTitle", "Signatory title", { placeholder: "e.g. Dean of Student Affairs" })}
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/50 p-4">
        <Checkbox id="college-approval" checked={v.requireEventApproval} onChange={(e) => set("requireEventApproval", e.target.checked)} className="mt-0.5" />
        <div>
          <Label htmlFor="college-approval">Require admin approval before events go live</Label>
          <p className="text-xs text-muted-foreground">Organizers submit events for review; college admins approve or send them back.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {id ? "Save changes" : "Create college"}
        </Button>
      </div>
    </form>
  );
}
