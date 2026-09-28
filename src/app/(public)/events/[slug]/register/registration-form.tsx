"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import type { QuestionType } from "@prisma/client";
import { registerAction } from "@/app/actions/registration";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { HoldCountdown } from "@/components/payments/hold-countdown";
import { CheckoutFeedback, useRazorpayCheckout } from "@/components/payments/pay-button";
import { phoneSchema } from "@/lib/validators";

type Question = { id: string; label: string; type: QuestionType; required: boolean; options: string[] };
type ProfileValues = { phone: string; studentId: string; departmentName: string; year: string };

const PROFILE_FIELDS = [
  { key: "phone", requiredKey: "phone", label: "Phone number", autoComplete: "tel", inputMode: "tel" },
  { key: "studentId", requiredKey: "studentId", label: "Student ID / roll number", autoComplete: "off", inputMode: "text" },
  { key: "departmentName", requiredKey: "department", label: "Department", autoComplete: "organization-title", inputMode: "text" },
] as const;

const YEARS = [1, 2, 3, 4, 5, 6];

/** Mirrors the server-side checks in registerForEvent so most mistakes are caught before submitting. */
function validate(requiredFields: string[], profile: ProfileValues, questions: Question[], answers: Record<string, string>) {
  const errors: Record<string, string> = {};
  const phone = profile.phone.trim();
  if (requiredFields.includes("phone") && !phone) errors.phone = "Phone number is required";
  else if (phone && !phoneSchema.safeParse(phone).success) errors.phone = "Enter a valid phone number";
  if (requiredFields.includes("studentId") && !profile.studentId.trim()) errors.studentId = "Student ID is required";
  else if (profile.studentId.trim().length > 40) errors.studentId = "Must be at most 40 characters";
  if (requiredFields.includes("department") && !profile.departmentName.trim()) errors.departmentName = "Department is required";
  else if (profile.departmentName.trim().length > 120) errors.departmentName = "Must be at most 120 characters";
  if (requiredFields.includes("year") && !profile.year) errors.year = "Year of study is required";

  for (const q of questions) {
    const key = `answers.${q.id}`;
    const value = (answers[q.id] ?? "").trim();
    if (!value) {
      if (q.required) errors[key] = q.type === "CHECKBOX" ? "You must accept to continue" : "This question is required";
      continue;
    }
    if (value.length > 2000) errors[key] = "Must be at most 2000 characters";
    else if (q.type === "NUMBER" && !Number.isFinite(Number(value))) errors[key] = "Enter a number";
    else if (q.type === "SELECT" && !q.options.includes(value)) errors[key] = "Choose one of the options";
  }
  return errors;
}

export function RegistrationForm({
  eventId,
  paid,
  feeLabel,
  requiredFields,
  profile: initialProfile,
  questions,
  terms,
}: {
  eventId: string;
  paid: boolean;
  feeLabel: string;
  requiredFields: string[];
  profile: ProfileValues;
  questions: Question[];
  terms: string | null;
}) {
  const router = useRouter();
  const checkout = useRazorpayCheckout();
  const [profile, setProfile] = useState<ProfileValues>(initialProfile);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<{ registrationId: string; holdExpiresAt: string | null } | null>(null);
  const inFlight = useRef(false);

  const visibleProfileFields = PROFILE_FIELDS.filter((f) => requiredFields.includes(f.requiredKey));
  const showYear = requiredFields.includes("year");
  const locked = pending || pendingPayment !== null;

  function clearError(key: string) {
    if (!errors[key]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  function setProfileValue(key: keyof ProfileValues, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
    clearError(key);
  }
  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
    clearError(`answers.${id}`);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current || pendingPayment) return;
    setFormError(null);
    const errs = validate(requiredFields, profile, questions, answers);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError("Please complete the highlighted fields.");
      const first = document.getElementById(fieldId(Object.keys(errs)[0]));
      first?.focus();
      return;
    }
    setErrors({});
    inFlight.current = true;
    setPending(true);
    try {
      const result = await registerAction({
        eventId,
        phone: requiredFields.includes("phone") ? profile.phone.trim() : undefined,
        studentId: requiredFields.includes("studentId") ? profile.studentId.trim() : undefined,
        departmentName: requiredFields.includes("department") ? profile.departmentName.trim() : undefined,
        year: showYear ? profile.year : undefined,
        answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim() !== "")),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        if (["ALREADY_REGISTERED", "EVENT_FULL", "REGISTRATION_CLOSED"].includes(result.code)) router.refresh();
        return;
      }
      const reg = result.data;
      if (reg.status === "CONFIRMED") {
        toast.success("You're registered! Your QR pass is ready.");
        router.push(`/my/registrations/${reg.registrationId}?welcome=1`);
        return;
      }
      setPendingPayment({ registrationId: reg.registrationId, holdExpiresAt: reg.holdExpiresAt });
      toast.success("Seat reserved. Complete the payment to confirm your registration.");
      void checkout.pay(reg.registrationId);
    } catch {
      const msg = "We couldn't reach the server. Check your connection and try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const holdExpiresAt = checkout.holdExpiresAt ?? pendingPayment?.holdExpiresAt ?? null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError && !pendingPayment && <Alert tone="danger">{formError}</Alert>}

      {(visibleProfileFields.length > 0 || showYear) && (
        <fieldset className="space-y-4" disabled={locked}>
          <legend className="mb-3 text-sm font-semibold">Participant details</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleProfileFields.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={fieldId(f.key)} error={errors[f.key]} required>
                <Input
                  name={f.key}
                  type={f.key === "phone" ? "tel" : "text"}
                  inputMode={f.inputMode}
                  autoComplete={f.autoComplete}
                  maxLength={f.key === "phone" ? 16 : f.key === "studentId" ? 40 : 120}
                  value={profile[f.key]}
                  onChange={(e) => setProfileValue(f.key, e.target.value)}
                  required
                />
              </Field>
            ))}
            {showYear && (
              <Field label="Year of study" htmlFor={fieldId("year")} error={errors.year} required>
                <Select name="year" value={profile.year} onChange={(e) => setProfileValue("year", e.target.value)} required>
                  <option value="">Select year</option>
                  {YEARS.map((y) => (
                    <option key={y} value={String(y)}>
                      Year {y}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Pre-filled from your profile. Anything new you enter is saved to your profile for next time.</p>
        </fieldset>
      )}

      {questions.length > 0 && (
        <fieldset className="space-y-4" disabled={locked}>
          <legend className="mb-3 text-sm font-semibold">Additional questions</legend>
          {questions.map((q) => (
            <QuestionField key={q.id} question={q} value={answers[q.id] ?? ""} error={errors[`answers.${q.id}`]} onChange={(v) => setAnswer(q.id, v)} />
          ))}
        </fieldset>
      )}

      {visibleProfileFields.length === 0 && !showYear && questions.length === 0 && (
        <p className="text-sm text-muted-foreground">No additional details are needed for this event — just confirm below.</p>
      )}

      {terms && (
        <details className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Event rules &amp; terms</summary>
          <p className="mt-2 whitespace-pre-line text-muted-foreground">{terms}</p>
        </details>
      )}

      {pendingPayment ? (
        <div className="space-y-4 border-t border-border pt-6">
          {holdExpiresAt && <HoldCountdown expiresAt={holdExpiresAt} />}
          <CheckoutFeedback state={checkout} />
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            loading={checkout.busy}
            disabled={checkout.notConfigured || checkout.phase === "done"}
            onClick={() => void checkout.pay(pendingPayment.registrationId)}
          >
            {!checkout.busy && <CreditCard aria-hidden />}
            {checkout.phase === "creating" ? "Preparing payment…" : checkout.phase === "checkout" ? "Waiting for payment…" : `Pay ${feeLabel}`}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {paid ? "Your seat is reserved as soon as you continue to payment." : "You'll get a QR pass for check-in right after registering."}
          </p>
          <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
            {pending ? "Registering…" : paid ? `Continue to pay ${feeLabel}` : "Confirm registration"}
          </Button>
        </div>
      )}
    </form>
  );
}

function fieldId(key: string) {
  return `reg-${key.replace(/\./g, "-")}`;
}

function QuestionField({ question: q, value, error, onChange }: { question: Question; value: string; error?: string; onChange: (v: string) => void }) {
  const id = fieldId(`answers.${q.id}`);
  if (q.type === "CHECKBOX") {
    return (
      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox
            id={id}
            name={id}
            className="mt-0.5"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
          />
          <span>
            {q.label}
            {q.required && (
              <span className="ml-0.5 text-danger" aria-hidden>
                *
              </span>
            )}
          </span>
        </label>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <Field label={q.label} htmlFor={id} error={error} required={q.required}>
      {q.type === "TEXTAREA" ? (
        <Textarea name={id} value={value} maxLength={2000} onChange={(e) => onChange(e.target.value)} required={q.required} />
      ) : q.type === "SELECT" ? (
        <Select name={id} value={value} onChange={(e) => onChange(e.target.value)} required={q.required}>
          <option value="">Select an option</option>
          {q.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          name={id}
          type={q.type === "NUMBER" ? "number" : "text"}
          inputMode={q.type === "NUMBER" ? "decimal" : undefined}
          maxLength={q.type === "NUMBER" ? undefined : 2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={q.required}
        />
      )}
    </Field>
  );
}
