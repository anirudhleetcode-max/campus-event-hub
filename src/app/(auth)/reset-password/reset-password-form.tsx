"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { resetPasswordAction } from "@/app/actions/auth";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { resetPasswordSchema } from "@/lib/validators";
import { zodToFieldErrors } from "@/lib/form-errors";
import { PasswordInput } from "../password-input";
import { PasswordStrength } from "../password-strength";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) {
      const errs = zodToFieldErrors(parsed.error);
      if (errs.token) setFormError("This reset link is invalid or has expired. Please request a new one.");
      setErrors(errs);
      return;
    }
    setErrors({});
    inFlight.current = true;
    setPending(true);
    try {
      const result = await resetPasswordAction(parsed.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success(result.message ?? "Your password has been reset.");
    } catch {
      const msg = "We couldn't reach the server. Check your connection and try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 rounded-lg bg-success-soft px-4 py-6 text-center text-success-soft-foreground" role="status">
          <CheckCircle2 className="size-8" aria-hidden />
          <p className="text-sm font-medium">Your password has been reset.</p>
          <p className="text-xs opacity-90">You can now sign in with your new password.</p>
        </div>
        <Link href="/login" className={buttonClasses("primary", "lg", "w-full")}>
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && (
        <Alert tone="danger">
          {formError}{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            Request a new link
          </Link>
        </Alert>
      )}
      <div className="space-y-2">
        <Field label="New password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number." required>
          <PasswordInput name="password" autoComplete="new-password" value={password} onValueChange={setPassword} disabled={pending} required />
        </Field>
        <PasswordStrength password={password} />
      </div>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
        <PasswordInput name="confirmPassword" autoComplete="new-password" value={confirmPassword} onValueChange={setConfirmPassword} disabled={pending} required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {pending ? "Updating password…" : "Reset password"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
