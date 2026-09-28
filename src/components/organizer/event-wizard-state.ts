import type { EventMode, QuestionType, SpeakerRole } from "@prisma/client";
import type { RegistrationField } from "@/lib/labels";
import type { EventFormValues } from "@/lib/validators";
import { toDateTimeLocal } from "@/lib/utils";

/** Editable form state of the event wizard (everything is a string/array the inputs can bind to). */
export type WizardQuestion = { key: string; id?: string; label: string; type: QuestionType; optionsText: string; required: boolean };
export type WizardScheduleItem = { key: string; time: string; title: string; description: string };
export type WizardSpeaker = { key: string; name: string; title: string; organization: string; bio: string; role: SpeakerRole };
export type WizardFaq = { key: string; question: string; answer: string };

export type WizardState = {
  collegeId: string;
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  departmentId: string;
  mode: EventMode;
  tagsText: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationDeadline: string;
  schedule: WizardScheduleItem[];
  venueName: string;
  venueAddress: string;
  city: string;
  latitude: string;
  longitude: string;
  onlineUrl: string;
  capacity: string;
  fee: string;
  eligibility: string;
  requiredFields: RegistrationField[];
  questions: WizardQuestion[];
  bannerUrl: string;
  galleryUrls: string[];
  rules: string;
  terms: string;
  refundPolicy: string;
  speakers: WizardSpeaker[];
  faqs: WizardFaq[];
};

export function emptyWizardState(collegeId = ""): WizardState {
  return {
    collegeId,
    title: "",
    summary: "",
    description: "",
    categoryId: "",
    departmentId: "",
    mode: "IN_PERSON",
    tagsText: "",
    startsAt: "",
    endsAt: "",
    registrationOpensAt: "",
    registrationDeadline: "",
    schedule: [],
    venueName: "",
    venueAddress: "",
    city: "",
    latitude: "",
    longitude: "",
    onlineUrl: "",
    capacity: "100",
    fee: "0",
    eligibility: "",
    requiredFields: [],
    questions: [],
    bannerUrl: "",
    galleryUrls: [],
    rules: "",
    terms: "",
    refundPolicy: "",
    speakers: [],
    faqs: [],
  };
}

type EventForWizard = {
  collegeId: string;
  title: string;
  summary: string;
  description: string;
  categoryId: string;
  departmentId: string | null;
  mode: EventMode;
  tags: string[];
  startsAt: Date;
  endsAt: Date;
  registrationOpensAt: Date | null;
  registrationDeadline: Date;
  schedule: unknown;
  venueName: string | null;
  venueAddress: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string | null;
  capacity: number;
  feeAmount: number;
  eligibility: string | null;
  requiredFields: string[];
  questions: { id: string; label: string; type: QuestionType; options: string[]; required: boolean }[];
  bannerUrl: string | null;
  galleryUrls: string[];
  rules: string | null;
  terms: string | null;
  refundPolicy: string | null;
  speakers: { name: string; title: string | null; organization: string | null; bio: string | null; role: SpeakerRole }[];
  faqs: unknown;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const REQUIRED_KEYS: RegistrationField[] = ["phone", "studentId", "department", "year"];

/** Prefill the wizard from a stored event (dates in the app timezone, fee in rupees). */
export function wizardStateFromEvent(e: EventForWizard): WizardState {
  const schedule = Array.isArray(e.schedule) ? (e.schedule as Record<string, unknown>[]) : [];
  const faqs = Array.isArray(e.faqs) ? (e.faqs as Record<string, unknown>[]) : [];
  return {
    collegeId: e.collegeId,
    title: e.title,
    summary: e.summary,
    description: e.description,
    categoryId: e.categoryId,
    departmentId: e.departmentId ?? "",
    mode: e.mode,
    tagsText: e.tags.join(", "),
    startsAt: toDateTimeLocal(e.startsAt),
    endsAt: toDateTimeLocal(e.endsAt),
    registrationOpensAt: toDateTimeLocal(e.registrationOpensAt),
    registrationDeadline: toDateTimeLocal(e.registrationDeadline),
    schedule: schedule.map((s, i) => ({ key: `s${i}`, time: str(s.time), title: str(s.title), description: str(s.description) })),
    venueName: e.venueName ?? "",
    venueAddress: e.venueAddress ?? "",
    city: e.city ?? "",
    latitude: e.latitude === null ? "" : String(e.latitude),
    longitude: e.longitude === null ? "" : String(e.longitude),
    onlineUrl: e.onlineUrl ?? "",
    capacity: String(e.capacity),
    fee: String(e.feeAmount / 100),
    eligibility: e.eligibility ?? "",
    requiredFields: REQUIRED_KEYS.filter((k) => e.requiredFields.includes(k)),
    questions: e.questions.map((q) => ({ key: q.id, id: q.id, label: q.label, type: q.type, optionsText: q.options.join("\n"), required: q.required })),
    bannerUrl: e.bannerUrl ?? "",
    galleryUrls: e.galleryUrls,
    rules: e.rules ?? "",
    terms: e.terms ?? "",
    refundPolicy: e.refundPolicy ?? "",
    speakers: e.speakers.map((s, i) => ({ key: `p${i}`, name: s.name, title: s.title ?? "", organization: s.organization ?? "", bio: s.bio ?? "", role: s.role })),
    faqs: faqs.map((f, i) => ({ key: `f${i}`, question: str(f.question), answer: str(f.answer) })),
  };
}

const splitList = (v: string, sep: RegExp) =>
  v
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

/** Convert wizard state into the shape validated by `eventInputSchema`. */
export function wizardPayload(s: WizardState): EventFormValues {
  const online = s.mode === "ONLINE";
  return {
    title: s.title,
    summary: s.summary,
    description: s.description,
    categoryId: s.categoryId,
    departmentId: s.departmentId,
    mode: s.mode,
    tags: splitList(s.tagsText, /,/).map((t) => t.replace(/^#/, "")),
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    registrationOpensAt: s.registrationOpensAt || undefined,
    registrationDeadline: s.registrationDeadline,
    schedule: s.schedule.map(({ time, title, description }) => ({ time, title, description })),
    venueName: online ? "" : s.venueName,
    venueAddress: online ? "" : s.venueAddress,
    city: online ? "" : s.city,
    latitude: online ? "" : s.latitude.trim(),
    longitude: online ? "" : s.longitude.trim(),
    onlineUrl: s.mode === "IN_PERSON" ? "" : s.onlineUrl,
    capacity: s.capacity,
    fee: s.fee.trim() === "" ? "0" : s.fee,
    eligibility: s.eligibility,
    requiredFields: s.requiredFields,
    questions: s.questions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      options: q.type === "SELECT" ? splitList(q.optionsText, /\r?\n|,/) : [],
      required: q.required,
    })),
    bannerUrl: s.bannerUrl,
    galleryUrls: s.galleryUrls,
    rules: s.rules,
    terms: s.terms,
    refundPolicy: s.refundPolicy,
    speakers: s.speakers.map(({ name, title, organization, bio, role }) => ({ name, title, organization, bio, role })),
    faqs: s.faqs.map(({ question, answer }) => ({ question, answer })),
  };
}
