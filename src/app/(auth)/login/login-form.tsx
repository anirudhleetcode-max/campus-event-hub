"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { loginSchema } from "@/lib/validators";
import { zodToFieldErrors } from "@/lib/form-errors";
import { PasswordInput } from "../password-input";

const DEMO_PASSWORD = "Demo@1234";
const DEMO_ACCOUNTS = [
  { email: "student@northfield.demo", role: "Student" },
  { email: "organizer@northfield.demo", role: "Event organizer" },
  { email: "faculty@northfield.demo", role: "Faculty coordinator" },
  { email: "admin@northfield.demo", role: "College admin" },
  { email: "super@demo.campushub.app", role: "Super admin" },
];

export function LoginForm({ next, showDemoAccounts }: { next?: string; showDemoAccounts: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(zodToFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    inFlight.current = true;
    setPending(true);
    try {
      const result = await loginAction({ ...parsed.data, next });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Signed in successfully");
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

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setErrors({});
    setFormError(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Email address" htmlFor="email" error={errors.email}>
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
        <div className="space-y-2">
          <Field label="Password" htmlFor="password" error={errors.password}>
            <PasswordInput name="password" autoComplete="current-password" value={password} onValueChange={setPassword} disabled={pending} required />
          </Field>
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to Campus Event Hub?{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-medium text-primary hover:underline">
          Create a student account
        </Link>
      </p>

      {showDemoAccounts && (
        <section aria-labelledby="demo-accounts" className="rounded-lg border border-dashed border-border-strong bg-surface-2 p-4">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="size-4 text-primary" aria-hidden />
            <h2 id="demo-accounts" className="text-sm font-semibold">
              Demo accounts
            </h2>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Available outside production only. Password for all accounts: <code className="font-mono font-medium text-foreground">{DEMO_PASSWORD}</code>
          </p>
          <ul className="space-y-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{a.email}</p>
                  <p className="text-xs text-muted-foreground">{a.role}</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => fillDemo(a.email)} disabled={pending} aria-label={`Use ${a.role} demo account`}>
                  Use
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
