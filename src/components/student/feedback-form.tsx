"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { feedbackSchema } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { submitFeedbackAction } from "@/app/actions/student";

const CRITERIA = [
  { key: "overall", legend: "Overall event", hint: "How was the event as a whole?" },
  { key: "organization", legend: "Organization", hint: "Schedule, communication and coordination" },
  { key: "venue", legend: "Venue / platform", hint: "Location, facilities or online platform" },
  { key: "speakers", legend: "Speakers & content", hint: "Quality of sessions, speakers or judges" },
  { key: "experience", legend: "Your experience", hint: "Would you attend a similar event again?" },
] as const;
type Key = (typeof CRITERIA)[number]["key"];

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function StarRating({ name, legend, hint, value, onChange, error }: { name: Key; legend: string; hint: string; value: number; onChange: (v: number) => void; error?: string }) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;
  const errorId = `${name}-error`;
  return (
    <fieldset className="space-y-1.5" aria-describedby={error ? errorId : `${name}-hint`} aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-medium">
        {legend}
        <span className="ml-0.5 text-danger" aria-hidden>
          *
        </span>
      </legend>
      <p id={`${name}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => {
            const id = `${name}-${n}`;
            return (
              <React.Fragment key={n}>
                <input
                  type="radio"
                  id={id}
                  name={name}
                  value={n}
                  checked={value === n}
                  onChange={() => onChange(n)}
                  className="peer sr-only"
                  required
                />
                <label
                  htmlFor={id}
                  onMouseEnter={() => setHover(n)}
                  className="cursor-pointer rounded-md p-1 transition-transform peer-focus-visible:outline-2 peer-focus-visible:outline-ring hover:scale-110"
                >
                  <Star
                    className={cn("size-7 sm:size-8", n <= shown ? "fill-accent text-accent" : "text-border-strong")}
                    strokeWidth={1.6}
                    aria-hidden
                  />
                  <span className="sr-only">
                    {n} star{n > 1 ? "s" : ""} — {WORDS[n]}
                  </span>
                </label>
              </React.Fragment>
            );
          })}
        </div>
        <span className="min-w-20 text-sm text-muted-foreground" aria-hidden>
          {shown ? WORDS[shown] : "Not rated"}
        </span>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function FeedbackForm({ eventId, registrationId }: { eventId: string; registrationId: string }) {
  const router = useRouter();
  const [ratings, setRatings] = React.useState<Record<Key, number>>({ overall: 0, organization: 0, venue: 0, speakers: 0, experience: 0 });
  const [comments, setComments] = React.useState("");
  const [suggestions, setSuggestions] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const payload = { eventId, ...ratings, comments, suggestions };
    const parsed = feedbackSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join(".");
        if (!fe[k]) fe[k] = issue.message;
      }
      setErrors(fe);
      const first = CRITERIA.find((c) => fe[c.key]);
      if (first) document.getElementById(`${first.key}-1`)?.focus();
      return;
    }
    setErrors({});
    setPending(true);
    const res = await submitFeedbackAction(payload);
    if (!res.ok) {
      setPending(false);
      setErrors(res.fieldErrors ?? {});
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Thanks for your feedback!");
    router.push(`/my/registrations/${registrationId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {CRITERIA.map((c) => (
          <StarRating
            key={c.key}
            name={c.key}
            legend={c.legend}
            hint={c.hint}
            value={ratings[c.key]}
            error={errors[c.key]}
            onChange={(v) => {
              setRatings((r) => ({ ...r, [c.key]: v }));
              setErrors((er) => ({ ...er, [c.key]: "" }));
            }}
          />
        ))}
      </div>
      <Field label="What did you like?" htmlFor="comments" error={errors.comments} hint="Optional · up to 2000 characters">
        <Textarea value={comments} onChange={(e) => setComments(e.target.value)} maxLength={2000} rows={4} />
      </Field>
      <Field label="Suggestions for the organizers" htmlFor="suggestions" error={errors.suggestions} hint="Optional · up to 2000 characters">
        <Textarea value={suggestions} onChange={(e) => setSuggestions(e.target.value)} maxLength={2000} rows={3} />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Submit feedback
        </Button>
      </div>
    </form>
  );
}
