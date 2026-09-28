"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signupAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { signupSchema } from "@/lib/validators";
import { zodToFieldErrors } from "@/lib/form-errors";
import { PasswordInput } from "../password-input";
import { PasswordStrength } from "../password-strength";

type Values = { name: string; email: string; collegeId: string; password: string; confirmPassword: string; acceptTerms: boolean };

export function SignupForm({ colleges, next }: { colleges: { id: string; name: string }[]; next?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({ name: "", email: "", collegeId: "", password: "", confirmPassword: "", acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[key];
        return nextErrors;
      });
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodToFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    inFlight.current = true;
    setPending(true);
    try {
      const result = await signupAction({ ...values, next });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Welcome to Campus Event Hub! Your account is ready.");
      router.replace(result.data.redirectTo);
      router.refresh();
    } catch {
      const msg = "We couldn't reach the server. Check your connection and try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Full name" htmlFor="name" error={errors.name} required>
        <Input name="name" autoComplete="name" value={values.name} onChange={(e) => set("name", e.target.value)} disabled={pending} maxLength={100} required />
      </Field>
      <Field label="College email" htmlFor="email" error={errors.email} required>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@college.edu"
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          disabled={pending}
          required
        />
      </Field>
      <Field label="College" htmlFor="collegeId" error={errors.collegeId} required>
        <Select name="collegeId" autoComplete="organization" value={values.collegeId} onChange={(e) => set("collegeId", e.target.value)} disabled={pending} required>
          <option value="">Select your college</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-2">
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters with a letter and a number." required>
          <PasswordInput name="password" autoComplete="new-password" value={values.password} onValueChange={(v) => set("password", v)} disabled={pending} required />
        </Field>
        <PasswordStrength password={values.password} />
      </div>
      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
        <PasswordInput
          name="confirmPassword"
          autoComplete="new-password"
          value={values.confirmPassword}
          onValueChange={(v) => set("confirmPassword", v)}
          disabled={pending}
          required
        />
      </Field>
      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox
            name="acceptTerms"
            className="mt-0.5"
            checked={values.acceptTerms}
            onChange={(e) => set("acceptTerms", e.target.checked)}
            disabled={pending}
            aria-invalid={errors.acceptTerms ? true : undefined}
            aria-describedby={errors.acceptTerms ? "acceptTerms-error" : undefined}
          />
          <span className="text-muted-foreground">
            I agree to the{" "}
            <Link href="/terms" className="font-medium text-primary hover:underline" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.acceptTerms && (
          <p id="acceptTerms-error" role="alert" className="text-xs font-medium text-danger">
            {errors.acceptTerms}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
