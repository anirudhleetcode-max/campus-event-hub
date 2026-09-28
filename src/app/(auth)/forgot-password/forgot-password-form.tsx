"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { forgotPasswordSchema } from "@/lib/validators";
import { zodToFieldErrors } from "@/lib/form-errors";

const GENERIC_SUCCESS = "If an account exists for that email, a reset link is on its way.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(zodToFieldErrors(parsed.error).email);
      return;
    }
    setError(undefined);
    inFlight.current = true;
    setPending(true);
    try {
      const result = await forgotPasswordAction(parsed.data);
      // Rate limiting is the only failure worth surfacing; everything else gets the generic message (no account enumeration).
      if (!result.ok && result.code === "RATE_LIMITED") {
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      if (!result.ok && result.fieldErrors?.email) {
        setError(result.fieldErrors.email);
        return;
      }
      setSentTo(parsed.data.email);
      toast.success(GENERIC_SUCCESS);
    } catch {
      const msg = "We couldn't reach the server. Check your connection and try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 rounded-lg bg-success-soft px-4 py-6 text-center text-success-soft-foreground" role="status">
          <MailCheck className="size-8" aria-hidden />
          <p className="text-sm font-medium">{GENERIC_SUCCESS}</p>
          <p className="text-xs opacity-90">
            Check the inbox (and spam folder) for <span className="font-semibold break-all">{sentTo}</span>. The link expires in 1 hour.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/login" className={buttonClasses("primary", "md", "flex-1")}>
            Back to sign in
          </Link>
          <Button type="button" variant="outline" className="flex-1" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError && <Alert tone="danger">{formError}</Alert>}
      <Field label="Email address" htmlFor="email" error={error}>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@college.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          required
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {pending ? "Sending link…" : "Send reset link"}
      </Button>
      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Back to sign in
      </Link>
    </form>
  );
}
