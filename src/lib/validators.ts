import { z } from "zod";
import { fromDateTimeLocal } from "./utils";

const trimmed = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters`);
const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/i, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,15}$/, "Enter a valid phone number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128),
});

export const signupSchema = z
  .object({
    name: requiredText("Name", 100).min(2, "Name must be at least 2 characters"),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    collegeId: z.uuid("Select your college"),
    acceptTerms: z.literal(true, { error: "You must accept the terms to continue" }),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ token: z.string().min(20), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Current password is required"), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const profileSchema = z.object({
  name: requiredText("Name", 100).min(2, "Name must be at least 2 characters"),
  phone: z.union([z.literal(""), phoneSchema]).optional().transform((v) => v || undefined),
  departmentId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
  year: z.union([z.literal(""), z.coerce.number().int().min(1).max(6)]).optional().transform((v) => (v === "" ? undefined : v)),
  studentId: optionalText(40),
  interests: z.array(trimmed(30).min(1)).max(12, "Choose at most 12 interests").default([]),
  avatarUrl: z.union([z.literal(""), z.string().max(500)]).optional().transform((v) => v || undefined),
});

// ─── Events ─────────────────────────────────────────────────

export const EVENT_MODES = ["IN_PERSON", "ONLINE", "HYBRID"] as const;
export const QUESTION_TYPES = ["TEXT", "TEXTAREA", "NUMBER", "SELECT", "CHECKBOX"] as const;
export const REQUIRED_FIELD_KEYS = ["phone", "studentId", "department", "year"] as const;

const dateTimeLocal = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .transform((v, ctx) => {
      const d = fromDateTimeLocal(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: `${label} is not a valid date` });
        return z.NEVER;
      }
      return d;
    });

export const questionSchema = z
  .object({
    id: z.uuid().optional(),
    label: requiredText("Question", 200),
    type: z.enum(QUESTION_TYPES),
    options: z.array(trimmed(100).min(1)).max(20).default([]),
    required: z.boolean().default(false),
  })
  .refine((q) => q.type !== "SELECT" || q.options.length >= 2, {
    path: ["options"],
    message: "Select questions need at least two options",
  });

export const speakerSchema = z.object({
  name: requiredText("Name", 100),
  title: optionalText(120),
  organization: optionalText(120),
  bio: optionalText(600),
  role: z.enum(["SPEAKER", "JUDGE", "GUEST"]).default("SPEAKER"),
});

export const scheduleItemSchema = z.object({
  time: requiredText("Time", 40),
  title: requiredText("Title", 120),
  description: optionalText(300),
});

export const faqSchema = z.object({
  question: requiredText("Question", 200),
  answer: requiredText("Answer", 1000),
});

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//.test(v) || v.startsWith("/"), "Enter a valid URL")
  .optional()
  .transform((v) => v || undefined);

/** Step-level schemas used by the wizard on the client; merged for the server. */
export const eventBasicsSchema = z.object({
  title: requiredText("Event name", 120).min(4, "Event name must be at least 4 characters"),
  summary: requiredText("Short summary", 200).min(10, "Summary must be at least 10 characters"),
  description: requiredText("Description", 10000).min(30, "Description must be at least 30 characters"),
  categoryId: z.uuid("Select a category"),
  departmentId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
  mode: z.enum(EVENT_MODES),
  tags: z.array(trimmed(30).min(1)).max(10).default([]),
});

export const eventScheduleSchema = z.object({
  startsAt: dateTimeLocal("Start"),
  endsAt: dateTimeLocal("End"),
  registrationOpensAt: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const d = fromDateTimeLocal(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Registration opening is not a valid date" });
        return z.NEVER;
      }
      return d;
    }),
  registrationDeadline: dateTimeLocal("Registration deadline"),
  schedule: z.array(scheduleItemSchema).max(40).default([]),
});

export const eventVenueSchema = z.object({
  venueName: optionalText(120),
  venueAddress: optionalText(300),
  city: optionalText(80),
  latitude: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]).optional().transform((v) => (v === "" ? undefined : v)),
  longitude: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]).optional().transform((v) => (v === "" ? undefined : v)),
  onlineUrl: httpsUrl,
});

export const eventRegistrationSchema = z.object({
  capacity: z.coerce.number({ error: "Enter a number" }).int().min(1, "Capacity must be at least 1").max(100000),
  /** Fee in rupees on the form; converted to paise by the service. */
  fee: z.coerce.number({ error: "Enter a number" }).min(0, "Fee cannot be negative").max(100000),
  eligibility: optionalText(1000),
  requiredFields: z.array(z.enum(REQUIRED_FIELD_KEYS)).default([]),
  questions: z.array(questionSchema).max(20).default([]),
});

export const eventMediaSchema = z.object({
  bannerUrl: httpsUrl,
  galleryUrls: z.array(z.string().max(500)).max(8).default([]),
});

export const eventRulesSchema = z.object({
  rules: optionalText(5000),
  terms: optionalText(5000),
  refundPolicy: optionalText(2000),
  speakers: z.array(speakerSchema).max(30).default([]),
  faqs: z.array(faqSchema).max(30).default([]),
});

export const eventInputSchema = eventBasicsSchema
  .extend(eventScheduleSchema.shape)
  .extend(eventVenueSchema.shape)
  .extend(eventRegistrationSchema.shape)
  .extend(eventMediaSchema.shape)
  .extend(eventRulesSchema.shape)
  .superRefine((e, ctx) => {
    if (e.endsAt <= e.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after the start" });
    if (e.registrationDeadline > e.endsAt)
      ctx.addIssue({ code: "custom", path: ["registrationDeadline"], message: "Deadline must be before the event ends" });
    if (e.registrationOpensAt && e.registrationOpensAt >= e.registrationDeadline)
      ctx.addIssue({ code: "custom", path: ["registrationOpensAt"], message: "Registration must open before the deadline" });
    if (e.mode !== "ONLINE" && !e.venueName)
      ctx.addIssue({ code: "custom", path: ["venueName"], message: "Venue is required for in-person events" });
    if (e.mode !== "IN_PERSON" && !e.onlineUrl)
      ctx.addIssue({ code: "custom", path: ["onlineUrl"], message: "Meeting link is required for online events" });
    if (e.fee > 0 && e.fee < 1) ctx.addIssue({ code: "custom", path: ["fee"], message: "Minimum paid fee is ₹1" });
  });

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventFormValues = z.input<typeof eventInputSchema>;

// ─── Registration / feedback ────────────────────────────────

export const registrationSubmitSchema = z.object({
  eventId: z.uuid(),
  phone: z.union([z.literal(""), phoneSchema]).optional().transform((v) => v || undefined),
  studentId: optionalText(40),
  departmentName: optionalText(120),
  year: z.union([z.literal(""), z.coerce.number().int().min(1).max(6)]).optional().transform((v) => (v === "" ? undefined : v)),
  answers: z.record(z.string(), z.string().max(2000)).default({}),
});

const rating = (label: string) => z.coerce.number({ error: `Rate ${label}` }).int().min(1, `Rate ${label}`).max(5);

export const feedbackSchema = z.object({
  eventId: z.uuid(),
  overall: rating("the event overall"),
  organization: rating("the organization"),
  venue: rating("the venue"),
  speakers: rating("the speakers"),
  experience: rating("your experience"),
  comments: optionalText(2000),
  suggestions: optionalText(2000),
});

// ─── Admin ──────────────────────────────────────────────────

export const collegeSchema = z.object({
  name: requiredText("College name", 160),
  shortName: optionalText(30),
  city: optionalText(80),
  state: optionalText(80),
  website: httpsUrl,
  contactEmail: z.union([z.literal(""), emailSchema]).optional().transform((v) => v || undefined),
  logoUrl: httpsUrl,
  requireEventApproval: z.coerce.boolean().default(true),
  signatoryName: optionalText(100),
  signatoryTitle: optionalText(100),
});

export const departmentSchema = z.object({
  collegeId: z.uuid(),
  name: requiredText("Department name", 120),
  code: requiredText("Code", 12).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers or dashes").transform((v) => v.toUpperCase()),
});

export const createUserSchema = z.object({
  name: requiredText("Name", 100),
  email: emailSchema,
  role: z.enum(["SUPER_ADMIN", "COLLEGE_ADMIN", "EVENT_ORGANIZER", "FACULTY_COORDINATOR", "STUDENT"]),
  collegeId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
  departmentId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
  password: passwordSchema,
});

export const announcementSchema = z.object({
  title: requiredText("Title", 120),
  body: requiredText("Message", 2000),
  audience: z.enum(["ALL_STUDENTS", "ALL_USERS", "EVENT_PARTICIPANTS", "STAFF"]),
  eventId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
  collegeId: z.union([z.literal(""), z.uuid()]).optional().transform((v) => v || undefined),
  sendEmail: z.coerce.boolean().default(false),
});

export const issueCertificatesSchema = z.object({
  eventId: z.uuid(),
  type: z.enum(["PARTICIPATION", "WINNER", "RUNNER_UP", "VOLUNTEER", "ORGANIZER", "SPEAKER"]),
  userIds: z.array(z.uuid()).max(5000).optional(),
  position: optionalText(60),
});

export const refundSchema = z.object({
  paymentId: z.uuid(),
  amount: z.coerce.number().positive().optional(),
  reason: requiredText("Reason", 300),
});

export const settingsSchema = z.object({
  platformName: requiredText("Platform name", 60),
  supportEmail: emailSchema,
  seatHoldMinutes: z.coerce.number().int().min(5).max(60),
  reminderOffsetsHours: z
    .string()
    .transform((v) => v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0))
    .pipe(z.array(z.number().int().min(1).max(24 * 30)).min(1, "Add at least one reminder").max(6)),
  allowStudentSignup: z.coerce.boolean().default(true),
  maintenanceBanner: optionalText(200),
});
