"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EventMode, EventStatus, QuestionType, SpeakerRole } from "@prisma/client";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ExternalLink, Plus, Save, Send, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { EventCover } from "@/components/events/event-cover";
import { publishOrSubmitAction, saveEventAction } from "@/app/actions/organizer";
import { EVENT_MODE, REGISTRATION_FIELDS, type RegistrationField } from "@/lib/labels";
import {
  eventBasicsSchema, eventInputSchema, eventMediaSchema, eventRegistrationSchema, eventRulesSchema, eventScheduleSchema, eventVenueSchema,
} from "@/lib/validators";
import { cn, formatDateRange, formatDateTime, formatMoney, fromDateTimeLocal } from "@/lib/utils";
import { wizardPayload, type WizardState } from "./event-wizard-state";

type Option = { id: string; name: string };
type VenueOption = { id: string; name: string; address: string | null; city: string | null; latitude: number | null; longitude: number | null; collegeId: string };

export type EventWizardProps = {
  eventId?: string;
  status?: EventStatus;
  initial: WizardState;
  categories: (Option & { color: string })[];
  departments: (Option & { collegeId: string })[];
  venues: VenueOption[];
  /** Only for super admins, who must choose the hosting college when creating. */
  colleges?: Option[];
  /** Computed on the server: whether finishing publishes directly or submits for approval. */
  publishAction: "publish" | "submit";
  /** Fee can't change once people have registered. */
  feeLocked?: boolean;
};

const STEP_SCHEMAS = [eventBasicsSchema, eventScheduleSchema, eventVenueSchema, eventRegistrationSchema, eventMediaSchema, eventRulesSchema] as const;
const STEPS = [
  { title: "Basics", description: "Name, category and format", fields: [...Object.keys(eventBasicsSchema.shape), "collegeId"] },
  { title: "Date & time", description: "When it happens and when registration closes", fields: Object.keys(eventScheduleSchema.shape) },
  { title: "Venue", description: "Where participants should go", fields: Object.keys(eventVenueSchema.shape) },
  { title: "Registration", description: "Seats, fee and what you ask participants", fields: Object.keys(eventRegistrationSchema.shape) },
  { title: "Media", description: "Banner and gallery images", fields: Object.keys(eventMediaSchema.shape) },
  { title: "Rules & people", description: "Rules, policies, speakers and FAQs", fields: Object.keys(eventRulesSchema.shape) },
  { title: "Review", description: "Check everything before you publish", fields: [] as string[] },
];
const REVIEW = STEPS.length - 1;

const QUESTION_TYPES: Record<QuestionType, string> = {
  TEXT: "Short answer",
  TEXTAREA: "Paragraph",
  NUMBER: "Number",
  SELECT: "Dropdown",
  CHECKBOX: "Checkbox (yes / accept)",
};
const SPEAKER_ROLES: Record<SpeakerRole, string> = { SPEAKER: "Speaker", JUDGE: "Judge", GUEST: "Guest" };

function stepOf(key: string): number {
  const root = key.split(".")[0] ?? key;
  const i = STEPS.findIndex((s) => s.fields.includes(root));
  return i === -1 ? 0 : i;
}

function issuesToErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "_form";
    out[key] ??= i.message;
  }
  return out;
}

/** Cross-field rules (mirrors eventInputSchema.superRefine, which only runs once every field is valid). */
function crossFieldErrors(s: WizardState): Record<string, string> {
  const out: Record<string, string> = {};
  const start = fromDateTimeLocal(s.startsAt);
  const end = fromDateTimeLocal(s.endsAt);
  const deadline = fromDateTimeLocal(s.registrationDeadline);
  const opens = s.registrationOpensAt ? fromDateTimeLocal(s.registrationOpensAt) : null;
  if (start && end && end <= start) out.endsAt = "End must be after the start";
  if (deadline && end && deadline > end) out.registrationDeadline = "Deadline must be before the event ends";
  if (opens && deadline && opens >= deadline) out.registrationOpensAt = "Registration must open before the deadline";
  if (s.mode !== "ONLINE" && !s.venueName.trim()) out.venueName = "Venue is required for in-person events";
  if (s.mode !== "IN_PERSON" && !s.onlineUrl.trim()) out.onlineUrl = "Meeting link is required for online events";
  const fee = Number(s.fee);
  if (fee > 0 && fee < 1) out.fee = "Minimum paid fee is ₹1";
  return out;
}

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export function EventWizard({ eventId: initialEventId, status, initial, categories, departments, venues, colleges, publishAction, feeLocked }: EventWizardProps) {
  const router = useRouter();
  const [state, setState] = React.useState<WizardState>(initial);
  const [step, setStep] = React.useState(0);
  const [furthest, setFurthest] = React.useState(initialEventId ? REVIEW : 0);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [eventId, setEventId] = React.useState(initialEventId);
  const [saving, setSaving] = React.useState<"draft" | "publish" | null>(null);
  const [uploading, setUploading] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const needsCollege = Boolean(colleges) && !eventId;
  const isDraft = !status || status === "DRAFT";

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = React.useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
    setDirty(true);
    const keys = Object.keys(patch);
    setErrors((e) => {
      if (!keys.some((k) => Object.keys(e).some((ek) => ek === k || ek.startsWith(`${k}.`)))) return e;
      return Object.fromEntries(Object.entries(e).filter(([ek]) => !keys.some((k) => ek === k || ek.startsWith(`${k}.`))));
    });
  }, []);

  const collegeId = state.collegeId;
  const collegeDepartments = departments.filter((d) => !collegeId || d.collegeId === collegeId);
  const collegeVenues = venues.filter((v) => !collegeId || v.collegeId === collegeId);

  function validateStep(i: number): Record<string, string> {
    if (i === REVIEW) return {};
    const payload = wizardPayload(state);
    const res = STEP_SCHEMAS[i]!.safeParse(payload);
    const errs = res.success ? {} : issuesToErrors(res.error.issues);
    for (const [k, v] of Object.entries(crossFieldErrors(state))) if (stepOf(k) === i) errs[k] ??= v;
    if (i === 0 && needsCollege && !state.collegeId) errs.collegeId = "Select the college hosting this event";
    return errs;
  }

  function validateAll(): Record<string, string> {
    const res = eventInputSchema.safeParse(wizardPayload(state));
    const errs = res.success ? {} : issuesToErrors(res.error.issues);
    for (const [k, v] of Object.entries(crossFieldErrors(state))) errs[k] ??= v;
    if (needsCollege && !state.collegeId) errs.collegeId = "Select the college hosting this event";
    return errs;
  }

  function goTo(i: number) {
    setStep(i);
    setFurthest((f) => Math.max(f, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }

  function showErrors(errs: Record<string, string>) {
    setErrors(errs);
    const first = Math.min(...Object.keys(errs).map(stepOf));
    if (Number.isFinite(first) && first !== step) goTo(first);
  }

  function next() {
    const errs = validateStep(step);
    if (Object.keys(errs).length) {
      setErrors((e) => ({ ...e, ...errs }));
      toast.error("Please fix the highlighted fields to continue.");
      return;
    }
    goTo(Math.min(step + 1, REVIEW));
  }

  async function save(): Promise<string | null> {
    const errs = validateAll();
    if (Object.keys(errs).length) {
      showErrors(errs);
      toast.error("Some details need attention before saving.");
      return null;
    }
    const res = await saveEventAction({ eventId, collegeId: needsCollege ? state.collegeId : undefined, values: wizardPayload(state) });
    if (!res.ok) {
      if (res.fieldErrors && Object.keys(res.fieldErrors).length) showErrors(res.fieldErrors);
      toast.error(res.error);
      return null;
    }
    if (res.data.created) {
      setEventId(res.data.id);
      window.history.replaceState(null, "", `/organizer/events/${res.data.id}/edit`);
    }
    setDirty(false);
    return res.data.id;
  }

  async function saveDraft() {
    if (saving || uploading) return;
    setSaving("draft");
    try {
      const id = await save();
      if (id) toast.success(isDraft ? "Draft saved." : "Changes saved.");
    } catch {
      toast.error("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  async function finish() {
    if (saving || uploading) return;
    setSaving("publish");
    try {
      const id = await save();
      if (!id) return;
      if (isDraft) {
        const res = await publishOrSubmitAction(id);
        if (!res.ok) {
          toast.error(res.error, { description: "Your changes were saved as a draft." });
          return;
        }
        toast.success(res.data.action === "submit" ? "Submitted for approval. We'll notify you once it's reviewed." : "Your event is live!");
      } else toast.success("Changes saved.");
      router.push(`/organizer/events/${id}`);
      router.refresh();
    } catch {
      toast.error("Something went wrong while saving. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  const err = (k: string) => errors[k];
  const busy = saving !== null;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <nav aria-label="Event setup steps">
        <p className="mb-3 text-sm text-muted-foreground sm:hidden">
          Step {step + 1} of {STEPS.length} · <span className="font-medium text-foreground">{STEPS[step]!.title}</span>
        </p>
        <ol className="flex gap-1 overflow-x-auto pb-1 sm:gap-2">
          {STEPS.map((s, i) => {
            const hasError = Object.keys(errors).some((k) => stepOf(k) === i && i !== REVIEW);
            const reachable = i <= furthest;
            const done = i < step && !hasError;
            return (
              <li key={s.title} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => reachable && goTo(i)}
                  disabled={!reachable || busy}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "group flex w-full min-w-10 flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:px-2 sm:text-left",
                    i === step ? "text-foreground" : "text-muted-foreground",
                    reachable && i !== step && "hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                      hasError
                        ? "border-danger bg-danger-soft text-danger-soft-foreground"
                        : i === step
                          ? "border-primary bg-primary text-primary-foreground"
                          : done
                            ? "border-primary bg-primary-soft text-primary-soft-foreground"
                            : "border-border-strong bg-surface",
                    )}
                  >
                    {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn("hidden truncate sm:block", i === step && "font-semibold")}>{s.title}</span>
                  <span className="sr-only">{hasError ? " (has errors)" : done ? " (complete)" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>
            <span ref={headingRef} tabIndex={-1} className="outline-none">
              {STEPS[step]!.title}
            </span>
          </CardTitle>
          <CardDescription>{STEPS[step]!.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <>
              {needsCollege && colleges && (
                <Field label="Hosting college" htmlFor="f-college" error={err("collegeId")} required>
                  <Select value={state.collegeId} onChange={(e) => update({ collegeId: e.target.value, departmentId: "" })}>
                    <option value="">Select a college</option>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label="Event name" htmlFor="f-title" error={err("title")} required>
                <Input value={state.title} onChange={(e) => update({ title: e.target.value })} maxLength={120} placeholder="e.g. CodeSprint 2026 — 24h Hackathon" />
              </Field>
              <Field label="Short summary" htmlFor="f-summary" error={err("summary")} hint="Shown on event cards (10–200 characters)." required>
                <Input value={state.summary} onChange={(e) => update({ summary: e.target.value })} maxLength={200} />
              </Field>
              <Field label="Description" htmlFor="f-description" error={err("description")} hint="What participants will do, learn or win." required>
                <Textarea value={state.description} onChange={(e) => update({ description: e.target.value })} rows={8} maxLength={10000} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="f-category" error={err("categoryId")} required>
                  <Select value={state.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
                    <option value="">Select a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Department" htmlFor="f-department" error={err("departmentId")} hint="Optional — leave empty for college-wide events.">
                  <Select value={state.departmentId} onChange={(e) => update({ departmentId: e.target.value })} disabled={needsCollege && !state.collegeId}>
                    <option value="">College-wide</option>
                    {collegeDepartments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Event type</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(EVENT_MODE) as EventMode[]).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                        state.mode === m ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border hover:bg-surface-2",
                      )}
                    >
                      <input type="radio" name="mode" value={m} checked={state.mode === m} onChange={() => update({ mode: m })} className="accent-[var(--primary)]" />
                      {EVENT_MODE[m]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Tags" htmlFor="f-tags" error={err("tags") ?? Object.entries(errors).find(([k]) => k.startsWith("tags."))?.[1]} hint="Comma separated, up to 10 — e.g. ai, web, beginner-friendly">
                <Input value={state.tagsText} onChange={(e) => update({ tagsText: e.target.value })} maxLength={400} />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starts" htmlFor="f-start" error={err("startsAt")} required>
                  <Input type="datetime-local" value={state.startsAt} onChange={(e) => update({ startsAt: e.target.value })} />
                </Field>
                <Field label="Ends" htmlFor="f-end" error={err("endsAt")} required>
                  <Input type="datetime-local" value={state.endsAt} min={state.startsAt || undefined} onChange={(e) => update({ endsAt: e.target.value })} />
                </Field>
                <Field label="Registration opens" htmlFor="f-opens" error={err("registrationOpensAt")} hint="Optional — leave empty to open as soon as it's published.">
                  <Input type="datetime-local" value={state.registrationOpensAt} onChange={(e) => update({ registrationOpensAt: e.target.value })} />
                </Field>
                <Field label="Registration deadline" htmlFor="f-deadline" error={err("registrationDeadline")} required>
                  <Input type="datetime-local" value={state.registrationDeadline} max={state.endsAt || undefined} onChange={(e) => update({ registrationDeadline: e.target.value })} />
                </Field>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Schedule</p>
                    <p className="text-xs text-muted-foreground">Optional agenda shown on the event page.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={state.schedule.length >= 40}
                    onClick={() => update({ schedule: [...state.schedule, { key: newKey(), time: "", title: "", description: "" }] })}
                  >
                    <Plus /> Add item
                  </Button>
                </div>
                {state.schedule.map((s, i) => (
                  <div key={s.key} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[9rem_1fr_auto] sm:items-start">
                    <Field label="Time" htmlFor={`f-sched-${s.key}-time`} error={err(`schedule.${i}.time`)}>
                      <Input value={s.time} placeholder="10:00 AM" maxLength={40} onChange={(e) => update({ schedule: state.schedule.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} />
                    </Field>
                    <div className="space-y-3">
                      <Field label="Title" htmlFor={`f-sched-${s.key}-title`} error={err(`schedule.${i}.title`)}>
                        <Input value={s.title} maxLength={120} onChange={(e) => update({ schedule: state.schedule.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                      </Field>
                      <Field label="Details" htmlFor={`f-sched-${s.key}-desc`} error={err(`schedule.${i}.description`)}>
                        <Input value={s.description} maxLength={300} onChange={(e) => update({ schedule: state.schedule.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                      </Field>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="sm:mt-6" aria-label={`Remove schedule item ${i + 1}`} onClick={() => update({ schedule: state.schedule.filter((_, j) => j !== i) })}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {state.mode !== "ONLINE" && (
                <>
                  {collegeVenues.length > 0 && (
                    <Field label="Use a saved venue" htmlFor="f-saved-venue" hint="Venues from earlier events at your college.">
                      <Select
                        value=""
                        onChange={(e) => {
                          const v = collegeVenues.find((x) => x.id === e.target.value);
                          if (v)
                            update({
                              venueName: v.name,
                              venueAddress: v.address ?? "",
                              city: v.city ?? "",
                              latitude: v.latitude === null ? "" : String(v.latitude),
                              longitude: v.longitude === null ? "" : String(v.longitude),
                            });
                        }}
                      >
                        <option value="">Choose a venue to prefill…</option>
                        {collegeVenues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.city ? ` · ${v.city}` : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Venue name" htmlFor="f-venue" error={err("venueName")} required>
                      <Input value={state.venueName} onChange={(e) => update({ venueName: e.target.value })} maxLength={120} placeholder="e.g. Main Auditorium" />
                    </Field>
                    <Field label="City" htmlFor="f-city" error={err("city")}>
                      <Input value={state.city} onChange={(e) => update({ city: e.target.value })} maxLength={80} />
                    </Field>
                  </div>
                  <Field label="Address" htmlFor="f-address" error={err("venueAddress")}>
                    <Textarea value={state.venueAddress} onChange={(e) => update({ venueAddress: e.target.value })} rows={2} maxLength={300} className="min-h-16" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Latitude" htmlFor="f-lat" error={err("latitude")} hint="Optional, e.g. 12.9716">
                      <Input inputMode="decimal" value={state.latitude} onChange={(e) => update({ latitude: e.target.value })} maxLength={20} />
                    </Field>
                    <Field label="Longitude" htmlFor="f-lng" error={err("longitude")} hint="Optional, e.g. 77.5946">
                      <Input inputMode="decimal" value={state.longitude} onChange={(e) => update({ longitude: e.target.value })} maxLength={20} />
                    </Field>
                  </div>
                  <MapLink state={state} />
                </>
              )}
              {state.mode !== "IN_PERSON" && (
                <Field label="Online meeting link" htmlFor="f-online" error={err("onlineUrl")} hint="Shared with confirmed participants only." required>
                  <Input type="url" value={state.onlineUrl} onChange={(e) => update({ onlineUrl: e.target.value })} maxLength={500} placeholder="https://meet.example.com/…" />
                </Field>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Maximum participants" htmlFor="f-capacity" error={err("capacity")} required>
                  <Input type="number" inputMode="numeric" min={1} max={100000} value={state.capacity} onChange={(e) => update({ capacity: e.target.value })} />
                </Field>
                <Field
                  label="Registration fee (₹)"
                  htmlFor="f-fee"
                  error={err("fee")}
                  hint={feeLocked ? "The fee is locked because people have already registered." : "Use 0 for a free event."}
                >
                  <Input type="number" inputMode="decimal" min={0} step="1" value={state.fee} onChange={(e) => update({ fee: e.target.value })} disabled={feeLocked} />
                </Field>
              </div>
              <Field label="Eligibility" htmlFor="f-eligibility" error={err("eligibility")} hint="Optional — e.g. Open to 2nd–4th year CSE and IT students.">
                <Textarea value={state.eligibility} onChange={(e) => update({ eligibility: e.target.value })} rows={2} maxLength={1000} className="min-h-16" />
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Required participant details</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(REGISTRATION_FIELDS) as RegistrationField[]).map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={state.requiredFields.includes(f)}
                        onChange={(e) => update({ requiredFields: e.target.checked ? [...state.requiredFields, f] : state.requiredFields.filter((x) => x !== f) })}
                      />
                      {REGISTRATION_FIELDS[f]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Custom questions</p>
                    <p className="text-xs text-muted-foreground">Asked on the registration form (up to 20).</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={state.questions.length >= 20}
                    onClick={() => update({ questions: [...state.questions, { key: newKey(), label: "", type: "TEXT", optionsText: "", required: false }] })}
                  >
                    <Plus /> Add question
                  </Button>
                </div>
                {state.questions.map((q, i) => {
                  const setQ = (patch: Partial<typeof q>) => update({ questions: state.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={q.key} className="space-y-3 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Question {i + 1}</span>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => update({ questions: move(state.questions, i, i - 1) })}>
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Move question ${i + 1} down`}
                            disabled={i === state.questions.length - 1}
                            onClick={() => update({ questions: move(state.questions, i, i + 1) })}
                          >
                            <ArrowDown />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => update({ questions: state.questions.filter((_, j) => j !== i) })}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                        <Field label="Question" htmlFor={`f-q-${q.key}-label`} error={err(`questions.${i}.label`)}>
                          <Input value={q.label} maxLength={200} onChange={(e) => setQ({ label: e.target.value })} />
                        </Field>
                        <Field label="Answer type" htmlFor={`f-q-${q.key}-type`}>
                          <Select value={q.type} onChange={(e) => setQ({ type: e.target.value as QuestionType })}>
                            {Object.entries(QUESTION_TYPES).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      {q.type === "SELECT" && (
                        <Field label="Options" htmlFor={`f-q-${q.key}-options`} error={err(`questions.${i}.options`)} hint="One option per line (at least two).">
                          <Textarea value={q.optionsText} rows={3} className="min-h-20" onChange={(e) => setQ({ optionsText: e.target.value })} />
                        </Field>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={q.required} onChange={(e) => setQ({ required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <ImageUpload
                kind="banner"
                label="Banner image"
                hint="Wide image shown at the top of the event page (8:3). Without one, a designed cover is generated."
                value={state.bannerUrl}
                onChange={(url) => update({ bannerUrl: url })}
                error={err("bannerUrl")}
                onUploadingChange={(u) => setUploading((n) => Math.max(0, n + (u ? 1 : -1)))}
              />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Gallery</p>
                  <p className="text-xs text-muted-foreground">Up to 8 photos from past editions, the venue or prizes.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {state.galleryUrls.map((url, i) => (
                    <ImageUpload
                      key={`${url}-${i}`}
                      kind="gallery"
                      label={`Photo ${i + 1}`}
                      value={url}
                      onChange={(next) => update({ galleryUrls: next ? state.galleryUrls.map((u, j) => (j === i ? next : u)) : state.galleryUrls.filter((_, j) => j !== i) })}
                      onUploadingChange={(u) => setUploading((n) => Math.max(0, n + (u ? 1 : -1)))}
                    />
                  ))}
                  {state.galleryUrls.length < 8 && (
                    <ImageUpload
                      key={`new-${state.galleryUrls.length}`}
                      kind="gallery"
                      label={state.galleryUrls.length ? "Add another photo" : "Add a photo"}
                      value=""
                      onChange={(url) => url && update({ galleryUrls: [...state.galleryUrls, url] })}
                      onUploadingChange={(u) => setUploading((n) => Math.max(0, n + (u ? 1 : -1)))}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <Field label="Rules" htmlFor="f-rules" error={err("rules")}>
                <Textarea value={state.rules} onChange={(e) => update({ rules: e.target.value })} rows={5} maxLength={5000} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Terms & conditions" htmlFor="f-terms" error={err("terms")}>
                  <Textarea value={state.terms} onChange={(e) => update({ terms: e.target.value })} rows={4} maxLength={5000} />
                </Field>
                <Field label="Refund policy" htmlFor="f-refund" error={err("refundPolicy")}>
                  <Textarea value={state.refundPolicy} onChange={(e) => update({ refundPolicy: e.target.value })} rows={4} maxLength={2000} />
                </Field>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Speakers & judges</p>
                    <p className="text-xs text-muted-foreground">Shown on the event page in this order.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={state.speakers.length >= 30}
                    onClick={() => update({ speakers: [...state.speakers, { key: newKey(), name: "", title: "", organization: "", bio: "", role: "SPEAKER" }] })}
                  >
                    <Plus /> Add person
                  </Button>
                </div>
                {state.speakers.map((p, i) => {
                  const setP = (patch: Partial<typeof p>) => update({ speakers: state.speakers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={p.key} className="space-y-3 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Person {i + 1}</span>
                        <div className="flex gap-1">
                          <Button type="button" variant="ghost" size="icon" aria-label={`Move person ${i + 1} up`} disabled={i === 0} onClick={() => update({ speakers: move(state.speakers, i, i - 1) })}>
                            <ArrowUp />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Remove person ${i + 1}`} onClick={() => update({ speakers: state.speakers.filter((_, j) => j !== i) })}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                        <Field label="Name" htmlFor={`f-sp-${p.key}-name`} error={err(`speakers.${i}.name`)}>
                          <Input value={p.name} maxLength={100} onChange={(e) => setP({ name: e.target.value })} />
                        </Field>
                        <Field label="Role" htmlFor={`f-sp-${p.key}-role`}>
                          <Select value={p.role} onChange={(e) => setP({ role: e.target.value as SpeakerRole })}>
                            {Object.entries(SPEAKER_ROLES).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Title" htmlFor={`f-sp-${p.key}-title`} error={err(`speakers.${i}.title`)}>
                          <Input value={p.title} maxLength={120} placeholder="e.g. Staff Engineer" onChange={(e) => setP({ title: e.target.value })} />
                        </Field>
                        <Field label="Organization" htmlFor={`f-sp-${p.key}-org`} error={err(`speakers.${i}.organization`)}>
                          <Input value={p.organization} maxLength={120} onChange={(e) => setP({ organization: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Short bio" htmlFor={`f-sp-${p.key}-bio`} error={err(`speakers.${i}.bio`)}>
                        <Textarea value={p.bio} rows={2} maxLength={600} className="min-h-16" onChange={(e) => setP({ bio: e.target.value })} />
                      </Field>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">FAQs</p>
                  <Button type="button" variant="outline" size="sm" disabled={state.faqs.length >= 30} onClick={() => update({ faqs: [...state.faqs, { key: newKey(), question: "", answer: "" }] })}>
                    <Plus /> Add FAQ
                  </Button>
                </div>
                {state.faqs.map((f, i) => (
                  <div key={f.key} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-3">
                      <Field label="Question" htmlFor={`f-faq-${f.key}-q`} error={err(`faqs.${i}.question`)}>
                        <Input value={f.question} maxLength={200} onChange={(e) => update({ faqs: state.faqs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
                      </Field>
                      <Field label="Answer" htmlFor={`f-faq-${f.key}-a`} error={err(`faqs.${i}.answer`)}>
                        <Textarea
                          value={f.answer}
                          rows={2}
                          maxLength={1000}
                          className="min-h-16"
                          onChange={(e) => update({ faqs: state.faqs.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })}
                        />
                      </Field>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="sm:mt-6" aria-label={`Remove FAQ ${i + 1}`} onClick={() => update({ faqs: state.faqs.filter((_, j) => j !== i) })}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === REVIEW && (
            <>
              {Object.keys(errors).length > 0 && (
                <Alert tone="danger" title="Some details need attention">
                  Steps with problems are marked in red above.
                </Alert>
              )}
              {isDraft && publishAction === "submit" && (
                <Alert tone="info" title="Approval required">
                  Your college reviews events before they go live. Submitting sends this event to a college administrator.
                </Alert>
              )}
              <EventPreview state={state} categories={categories} departments={departments} colleges={colleges} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:border sm:px-4">
        <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={step === 0 || busy}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {uploading > 0 && <span className="self-center text-xs text-muted-foreground">Waiting for uploads to finish…</span>}
          <Button type="button" variant="outline" onClick={saveDraft} loading={saving === "draft"} disabled={busy || uploading > 0}>
            <Save /> {isDraft ? "Save draft" : "Save changes"}
          </Button>
          {step < REVIEW ? (
            <Button type="button" onClick={next} disabled={busy}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button type="button" onClick={finish} loading={saving === "publish"} disabled={busy || uploading > 0}>
              <Send /> {isDraft ? (publishAction === "submit" ? "Save & submit for approval" : "Save & publish") : "Save & finish"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function mapsUrl(s: WizardState): string | null {
  const lat = Number(s.latitude);
  const lng = Number(s.longitude);
  if (s.latitude.trim() && s.longitude.trim() && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const q = [s.venueName, s.venueAddress, s.city].map((x) => x.trim()).filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

function MapLink({ state }: { state: WizardState }) {
  const url = mapsUrl(state);
  if (!url) return <p className="text-xs text-muted-foreground">Add a venue or coordinates to preview the location on a map.</p>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <ExternalLink className="size-4" aria-hidden /> Open in maps
    </a>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** Read-only preview of the public event page built from the current wizard state. */
function EventPreview({
  state,
  categories,
  departments,
  colleges,
}: {
  state: WizardState;
  categories: (Option & { color: string })[];
  departments: Option[];
  colleges?: Option[];
}) {
  const category = categories.find((c) => c.id === state.categoryId);
  const department = departments.find((d) => d.id === state.departmentId);
  const college = colleges?.find((c) => c.id === state.collegeId);
  const start = fromDateTimeLocal(state.startsAt);
  const end = fromDateTimeLocal(state.endsAt);
  const deadline = fromDateTimeLocal(state.registrationDeadline);
  const opens = state.registrationOpensAt ? fromDateTimeLocal(state.registrationOpensAt) : null;
  const fee = Math.round(Number(state.fee || 0) * 100);
  const payload = wizardPayload(state);
  const tags = payload.tags ?? [];
  const where = state.mode === "ONLINE" ? "Online" : [state.venueName, state.venueAddress, state.city].filter((x) => x.trim()).join(", ") || "Venue not set";

  return (
    <article className="overflow-hidden rounded-xl border border-border">
      <div className="aspect-[8/3] bg-surface-2">
        <EventCover bannerUrl={state.bannerUrl || null} title={state.title || "Untitled event"} color={category?.color} />
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {category && <Badge tone="primary">{category.name}</Badge>}
            <Badge>{EVENT_MODE[state.mode]}</Badge>
            {college && <Badge>{college.name}</Badge>}
            {department && <Badge>{department.name}</Badge>}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight break-words">{state.title || "Untitled event"}</h2>
          <p className="text-muted-foreground">{state.summary}</p>
          {tags.length > 0 && <p className="text-xs text-muted-foreground">{tags.map((t) => `#${t.toLowerCase()}`).join("  ")}</p>}
        </div>

        <dl className="grid gap-4 rounded-lg bg-surface-2/60 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">When</dt>
            <dd className="font-medium">{start && end ? formatDateRange(start, end) : "Dates not set"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="font-medium break-words">{where}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registration</dt>
            <dd className="font-medium">
              {opens ? `Opens ${formatDateTime(opens)} · ` : ""}
              {deadline ? `Closes ${formatDateTime(deadline)}` : "Deadline not set"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Fee & seats</dt>
            <dd className="font-medium">
              {Number.isFinite(fee) ? formatMoney(fee) : "—"} · {state.capacity || "—"} seats
            </dd>
          </div>
        </dl>

        <PreviewSection title="About">
          <p className="text-sm leading-relaxed whitespace-pre-line">{state.description || "No description yet."}</p>
        </PreviewSection>

        {state.eligibility && (
          <PreviewSection title="Eligibility">
            <p className="text-sm whitespace-pre-line">{state.eligibility}</p>
          </PreviewSection>
        )}

        {state.schedule.length > 0 && (
          <PreviewSection title="Schedule">
            <ol className="space-y-2 text-sm">
              {state.schedule.map((s) => (
                <li key={s.key} className="flex gap-3">
                  <span className="w-20 shrink-0 font-medium text-muted-foreground">{s.time}</span>
                  <span>
                    <span className="font-medium">{s.title}</span>
                    {s.description && <span className="block text-muted-foreground">{s.description}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </PreviewSection>
        )}

        {state.speakers.length > 0 && (
          <PreviewSection title="Speakers & judges">
            <ul className="grid gap-3 sm:grid-cols-2">
              {state.speakers.map((p) => (
                <li key={p.key} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">
                    {p.name} <span className="text-xs font-normal text-muted-foreground">· {SPEAKER_ROLES[p.role]}</span>
                  </p>
                  {(p.title || p.organization) && <p className="text-muted-foreground">{[p.title, p.organization].filter(Boolean).join(", ")}</p>}
                  {p.bio && <p className="mt-1 line-clamp-3 text-muted-foreground">{p.bio}</p>}
                </li>
              ))}
            </ul>
          </PreviewSection>
        )}

        {(state.requiredFields.length > 0 || state.questions.length > 0) && (
          <PreviewSection title="Registration form asks for">
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {state.requiredFields.map((f) => (
                <li key={f}>{REGISTRATION_FIELDS[f]}</li>
              ))}
              {state.questions.map((q) => (
                <li key={q.key}>
                  {q.label || "Untitled question"}
                  {q.required ? " (required)" : ""}
                </li>
              ))}
            </ul>
          </PreviewSection>
        )}

        {state.rules && (
          <PreviewSection title="Rules">
            <p className="text-sm whitespace-pre-line">{state.rules}</p>
          </PreviewSection>
        )}
        {(state.terms || state.refundPolicy) && (
          <div className="grid gap-6 sm:grid-cols-2">
            {state.terms && (
              <PreviewSection title="Terms & conditions">
                <p className="text-sm whitespace-pre-line text-muted-foreground">{state.terms}</p>
              </PreviewSection>
            )}
            {state.refundPolicy && (
              <PreviewSection title="Refund policy">
                <p className="text-sm whitespace-pre-line text-muted-foreground">{state.refundPolicy}</p>
              </PreviewSection>
            )}
          </div>
        )}

        {state.faqs.length > 0 && (
          <PreviewSection title="FAQs">
            <dl className="space-y-3 text-sm">
              {state.faqs.map((f) => (
                <div key={f.key}>
                  <dt className="font-medium">{f.question}</dt>
                  <dd className="text-muted-foreground whitespace-pre-line">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </PreviewSection>
        )}

        {state.galleryUrls.length > 0 && (
          <PreviewSection title="Gallery">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {state.galleryUrls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${url}-${i}`} src={url} alt={`Gallery photo ${i + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
              ))}
            </div>
          </PreviewSection>
        )}
      </div>
    </article>
  );
}
