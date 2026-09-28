"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePasswordSchema } from "@/lib/validators";
import { changePasswordAction } from "@/app/actions/auth";

const EMPTY = { currentPassword: "", password: "", confirmPassword: "" };

export function ChangePasswordForm() {
  const [values, setValues] = React.useState(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const set = (k: keyof typeof EMPTY, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = String(issue.path[0] ?? "_form");
        if (!fe[k]) fe[k] = issue.message;
      }
      setErrors(fe);
      return;
    }
    setPending(true);
    const res = await changePasswordAction(values);
    setPending(false);
    if (!res.ok) {
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    setValues(EMPTY);
    toast.success(res.message ?? "Password updated.");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword} required>
        <Input type="password" value={values.currentPassword} onChange={(e) => set("currentPassword", e.target.value)} autoComplete="current-password" maxLength={128} />
      </Field>
      <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number." required>
        <Input type="password" value={values.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" maxLength={128} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
        <Input type="password" value={values.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} autoComplete="new-password" maxLength={128} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Update password
        </Button>
      </div>
    </form>
  );
}
