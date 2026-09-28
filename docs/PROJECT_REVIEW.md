# Campus Event Hub — Project Review

**Team:** Apex Vision (Team 29) · **Review date:** 28-09-2026

This review describes what the repository actually contains and what has been verified by running it. Anything that has not been verified is listed under [Known limitations](#20-known-limitations).

---

## 1. Executive summary

Campus Event Hub is a working, full-stack **College Event Management Platform**. It replaces the usual mix of Google Forms, WhatsApp groups, spreadsheets, a separate payment page, paper attendance sheets and hand-made certificates with one system backed by one PostgreSQL database.

The whole event lifecycle is implemented end to end and is exercised by automated browser tests:

> event creation → approval → publishing → registration → payment → notifications → QR attendance → feedback → certificates → analytics → reports

**Verified state at review time:**

| Check | Result |
|---|---|
| Typecheck | Passes |
| ESLint | 0 problems |
| Unit and integration tests | 58 pass |
| Playwright E2E tests | 58 pass, two consecutive full runs |
| Production build | 74 routes |
| Prisma schema and migrations | Valid and up to date |

One flow has **not** been exercised against the real payment gateway: a live Razorpay payment. No Razorpay credentials were available (see §20).

## 2. Problem statement

College events are currently managed through multiple disconnected tools such as Google Forms, WhatsApp, Excel, payment platforms, certificate systems and attendance systems. The result is fragmented data, manual work and inefficient event management.

In practice this means:

- Registrations are copied between sheets by hand.
- Payments are reconciled against screenshots.
- Attendance is taken on paper.
- Certificates are made one by one.
- Nobody can answer "how did this event actually perform?"

## 3. Solution

A centralized College Event Management Platform that manages the complete event lifecycle in one place: event creation and registration, payments, communication, attendance, certificates, feedback and analytics. Every step reads and writes the same records, so data entered once flows through the rest of the lifecycle.

## 4. Target users

- Colleges and universities, through their administration.
- Event organizers: student clubs, committees and departments.
- Faculty coordinators who oversee events.
- Students, who discover events, register and take part.
- Volunteers who handle check-in at the entrance.
- Anyone who needs to verify a certificate, such as a recruiter or another college. No account is needed.

## 5. User roles

Roles are a Postgres enum and are enforced on the server in `src/server/auth/permissions.ts`.

| Role | Scope | Main permissions |
|---|---|---|
| **Super Admin** | Whole platform | Every college, subscriptions, platform settings, all events, users and audit logs |
| **College Admin** | Own college | Users and roles below admin, departments, college profile, event approval, payments, attendance, certificates, analytics, announcements, audit log |
| **Event Organizer** | Own events, plus events where they are a co-organizer | Create and edit events, submit for approval, manage registrations and refunds, scan attendance, issue certificates, see feedback and analytics, export data |
| **Faculty Coordinator** | Events they are assigned to | Read-only view of registrations, attendance, payments, feedback and reports |
| **Student** | Own records | Browse, register, pay, QR pass, feedback, certificates, profile |

**Event staff** are assigned per event and are separate from the platform role:

- **Volunteer:** gets the check-in scanner for that event only. A volunteer is usually a student.
- **Co-organizer:** full management of that event.
- **Faculty coordinator:** read-only access to that event.

## 6. Complete event lifecycle

```
DRAFT ─submit─▶ PENDING_APPROVAL ─approve─▶ PUBLISHED / REGISTRATION_OPEN ─close─▶ REGISTRATION_CLOSED
  │                    └─reject─▶ DRAFT                     │                        │
  └─publish (college without approval)─────────────────────┘                        ▼
                                                   ONGOING ─complete─▶ COMPLETED ─archive─▶ ARCHIVED
                                  (cancel from any active state ─▶ CANCELLED ─archive─▶ ARCHIVED)
```

- The state machine lives in `src/lib/event-status.ts`. Invalid transitions are rejected on the server.
- **Time-driven changes** are applied by `/api/cron/event-status`: opening and closing registration, starting the event, and completing it. Organizers can also move an event forward by hand.
- **Registration windows** are checked against the clock, so a stale stored status can never keep registration open past its deadline.

## 7. Feature list

- **Discovery:**
  - Server-side search across event, college, department, category and organizer.
  - Filters for category, college, department, format, price and date.
  - Sorting and pagination.
  - Live remaining-seat counter.
- **Event creation:**
  - A 7-step wizard: basics, schedule, venue, registration, media, rules and people, review.
  - Custom registration questions, required profile fields, speakers and judges, FAQs, schedule.
  - Banner and gallery uploads.
  - Duplicate, archive, cancel (a reason is required and participants are notified).
- **Approval:** optional per college. Organizers submit, college admins approve or send back with a note, and both actions are notified and audited.
- **Registration:**
  - Validated on client and server.
  - Seat allocation is safe under concurrency: a row lock prevents overbooking.
  - Unpaid seats are held for a limited time.
  - Students can cancel and register again.
- **Payments:** Razorpay orders, signature verification, webhooks and refunds (§11).
- **Communication:**
  - 13 in-app notification types, with a live unread badge.
  - Optional email through Resend.
  - Announcements to students, staff or an event's participants.
  - Scheduled reminders (7 days, 24 hours and 1 hour before by default; configurable).
- **QR attendance:** a camera scanner and manual entry, with a live attendance dashboard (§12).
- **Certificates:** six types, generated as PDFs, publicly verifiable, and revocable (§13).
- **Feedback:** five 1–5 ratings plus comments, one submission per participant (§14).
- **Analytics:** platform, college, organizer and per-event dashboards with trend charts (§15).
- **Exports:**
  - CSV files for registrations, payments, attendance, certificates, feedback and analytics.
  - A PDF report for each event.
- **Administration:**
  - Users: search, create, change role, suspend or reactivate, view activity.
  - Colleges: profile, subscription plan and event limit, suspend institution.
  - Departments, audit log, platform settings.

## 8. Architecture overview

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript in strict mode |
| UI | Tailwind CSS v4 with CSS-variable design tokens (light and dark themes), Radix primitives, lucide icons, Recharts |
| Data | PostgreSQL 16 through Prisma 6, with migrations and a seed script |
| Realtime | Postgres `LISTEN/NOTIFY` fanned out to Server-Sent Events (`/api/realtime`) |
| Payments | Razorpay Orders API, Checkout, webhooks, refunds |
| Files | S3-compatible storage; a local `.data/uploads` fallback outside production |
| PDF and QR | pdf-lib, qrcode; jsQR for camera decoding |
| Tests | Vitest (unit and integration against real Postgres), Playwright and axe-core (E2E) |

Code layout:

```
src/app/       routes: (public), (auth), (app) → student, organizer, admin; api/; actions/
src/server/    server-only code: db, env, auth, services/*, payments, pdf, realtime, storage, mailer
src/components/ UI kit, layout, charts, events, organizer, scanner, payments
src/lib/       shared pure code: zod validators, event state machine, labels, formatting
```

All business rules live in `src/server/services/*.ts`. Pages, server actions and API routes call these services and never write to the database directly.

## 9. Database overview

The schema has 27 models. The main ones:

- **Identity:** `User`, `Session`, `PasswordResetToken`
- **Institutions:** `College`, `Department`, `Subscription`
- **Events:** `EventCategory`, `Venue`, `Event`, `EventQuestion`, `EventSpeaker`, `EventVolunteer`
- **Registration and payments:** `Registration`, `RegistrationAnswer`, `Payment`, `PaymentWebhook`
- **Outcomes:** `Attendance`, `CertificateTemplate`, `Certificate`, `Feedback`
- **Communication:** `Notification`, `Announcement`, `ReminderLog`, `EmailLog`
- **Platform:** `AuditLog`, `SystemSetting`, `RateLimit`

**Integrity is enforced by the database itself, not only by application code.**

| Rule | How |
|---|---|
| One registration per student per event | `UNIQUE(event_id, user_id)` |
| One attendance record per registration | `UNIQUE(registration_id)` |
| One certificate per person, event and type | `UNIQUE(event_id, user_id, type)` |
| One feedback per registration, and per student per event | `UNIQUE(registration_id)` and `UNIQUE(event_id, user_id)` |
| Each Razorpay order, payment and refund recorded once | Unique IDs on each |
| Each webhook processed once | `UNIQUE(gateway_event_id)` |
| Sensible values | `CHECK` constraints: capacity > 0, fee ≥ 0, end after start, deadline before end, ratings between 1 and 5, refund ≤ amount |
| Fast search | Trigram (`pg_trgm`) indexes on event titles and summaries, college names, and user names and emails |

Users, colleges, departments and events are soft-deleted, which keeps the financial and audit history intact.

## 10. Security model

- **Authentication:**
  - Sessions are stored in the database. The token is a 256-bit random value in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); only an HMAC of it is stored.
  - Passwords are hashed with bcrypt (cost 12).
  - Suspending a user, changing their role or resetting their password revokes their sessions immediately.
  - Login does not reveal whether an account exists: timing is equalised and errors are generic.
- **Authorization:**
  - Every page, server action (36) and API route (14) checks the user on the server.
  - Event-level access is computed per request as manage, view, scan or approve.
  - `proxy.ts` only redirects early for convenience; it isn't relied on for security.
- **IDOR protection:**
  - Student records are always looked up together with the current user's ID.
  - Staff lookups go through `requireEventAccess`.
  - Admin data is scoped to the admin's college.
  - Checked by tests: cross-college access to pages, all six CSV exports, the PDF report, the scanner and the hub listings; and one student opening another student's registration, payment or certificate.
- **Input validation:** zod schemas are shared by client and server, but the server's result is final. The database queries are parameterised.
- **Cross-site request protection:** Server Actions get Next.js's origin checks, and cookie-authenticated API routes verify the `Origin` header.
- **Rate limits:** stored in Postgres, so they hold across servers. They cover login, signup, password reset, payment orders and verification, uploads and scanning.
- **Uploads:**
  - PNG, JPEG or WebP only, detected from the file's content. SVG is refused.
  - Size and pixel-dimension limits.
  - Each upload type needs the right role.
  - The local file server rejects path traversal.
- **HTTP headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and a `Permissions-Policy` that allows the camera only on this site.
- **Audit log:** records logins, event changes, approvals, payments and refunds, attendance, certificates, role and status changes, settings changes and exports.
- **Logging:** structured JSON. Secrets, tokens and signatures are redacted automatically.

## 11. Payment flow

1. The student registers. For a paid event the seat is **held** for 15 minutes by default, so an abandoned payment never uses up a seat permanently.
2. `POST /api/payments/order`: the **server** creates a Razorpay order for the registration's stored fee. The browser never supplies the amount.
3. The browser opens Razorpay Checkout.
4. `POST /api/payments/verify`: the server checks the HMAC signature, then **fetches the payment from Razorpay** and compares the order, amount and currency before confirming.
5. `POST /api/webhooks/razorpay`: Razorpay reports the same payment independently. The signature is checked against the raw request body, and each webhook event ID is processed only once.

Both step 4 and step 5 call the same capture routine, which locks the payment row. Whichever arrives first confirms the registration; the other does nothing.

- **Failed payment:** the registration stays pending, so the student can retry until the hold expires.
- **Late payment:** if the hold expired and the seat was taken meanwhile, the payment is **refunded automatically** instead of overbooking the event.
- **Refunds:** full or partial, only by staff who manage the event, and finalised by the `refund.processed` webhook.
- **Payments not configured:** paid registration is refused with a clear message, and no seat is held.

## 12. QR attendance flow

1. Each confirmed registration gets an opaque random token. The pass's QR code encodes `CEH1:<token>`, which contains no personal data.
2. The organizer or volunteer opens `/organizer/events/<id>/scan`. The browser camera and jsQR decode the pass; the registration ID can also be typed in by hand.
3. `POST /api/attendance/scan` rejects:
   - scanners without access to this event;
   - unknown or forged tokens;
   - a pass for a different event;
   - unpaid or cancelled registrations;
   - scans outside the check-in window (24 hours before the start to 24 hours after the end);
   - **duplicate scans**, which are also blocked by a unique constraint, so two simultaneous scans still record one check-in.
4. Attendance stores the time, the method (QR or manual) and who marked it. The attendance dashboard and the student get a live update.

## 13. Certificate flow

- **Types:**
  - Participation, Winner and Runner-up: only for participants who **checked in**. A no-show gets nothing.
  - Volunteer and Organizer: event staff.
  - Speaker: chosen recipients.
- **When:** once the event has started, or once the organizer has marked it ongoing or completed.
- **No duplicates:** issuing twice skips anyone who already has that certificate.
- **The document:** each certificate has a public ID (`CEH-YYYY-XXXXXXXX`). The PDF is generated on request (A4 landscape) with:
  - the college logo, or its monogram;
  - the recipient, event and date;
  - the signatory;
  - a verification QR code.
- **Downloads:** only the recipient, event staff and admins can download the PDF.
- **Public verification:** `/verify/<id>` shows validity, recipient, type, event, dates and the issuing college. It never shows email or phone.
- **Revocation:** a reason is required, and the verification page then shows the certificate as revoked.

## 14. Feedback flow

- **Who can submit:** only students whose registration is confirmed, and only after the event has ended or been marked completed.
- **Content:** five ratings from 1 to 5 (overall, organization, venue, speakers, experience) plus optional comments and suggestions. Ratings are checked by zod and again by a database constraint.
- **One per participant:** enforced by a unique constraint.
- **Feedback requests:** participants are asked for feedback when the event completes, whether it's completed by the cron job or by the organizer.
- **Organizer view:** averages for each rating, the distribution of overall ratings, and the comments. Everything can be exported as CSV.

## 15. Analytics

All figures are computed live from the database; nothing is hardcoded.

**Dashboards** (platform, college, organizer):

- **Totals:** users, events, registrations, net revenue, check-ins and certificates.
- **Daily or monthly trends:** registrations, revenue and attendance.
- **Rankings:** popular events, participation by department, and registrations by category.
- **Date ranges:** today, 7, 30 or 90 days, this year, or a custom range.

The data each user sees is scoped by role.

**Per event:**

| Metric | Formula |
|---|---|
| Registrations | confirmed registrations |
| Conversion rate | confirmed ÷ all registration attempts |
| Attendance rate | checked in ÷ confirmed |
| No-show rate | (confirmed − checked in) ÷ confirmed, shown once the event has started |
| Fill rate | confirmed ÷ capacity |
| Revenue | captured payments − refunds |

Per-event analytics also show the average rating, certificates issued, a registration timeline and check-ins by hour.

For example, the E2E test checks 2 registered and 1 attended as a **50% no-show rate**.

## 16. Testing strategy

- **Unit tests:**
  - the event state machine;
  - the permission (RBAC) matrix;
  - payment signature helpers;
  - CSV formula-injection protection;
  - log redaction;
  - QR parsing;
  - image type detection;
  - validators and timezone parsing.
- **Integration tests** (Vitest against a dedicated `campus_hub_test` database):
  - Concurrency: two students racing for the last seat means exactly one succeeds, and 20 students racing for 5 seats never overbook. These tests fail if the row lock is removed.
  - Payments: signatures, webhook replay, the checkout callback racing the webhook, late payments, and refunds.
  - Lifecycle permissions, attendance races, and certificate eligibility.
  - Feedback, reminders, analytics, exports, and subscription event limits.

## 17. E2E strategy

Playwright runs against the **production build** and a dedicated `campus_hub_e2e` database.

- **Database preparation:** `tests/e2e/prepare-db.ts` creates, migrates and seeds the database as part of the web-server start command, because Playwright starts its web server *before* `globalSetup` would run.
- **Safety guard:** it refuses any database whose name lacks `e2e`, or that `.env` uses for development.

| Suite | Covers |
|---|---|
| `demo-flow` | The live demo script, using **only the UI** and no database edits: create → approve → register → check in, with a duplicate refused → mark ongoing and completed → feedback → certificate → verify → analytics |
| `lifecycle` | The same lifecycle with the real **camera scanner** (a fake webcam plays the QR code) and the real status cron |
| `auth` | Redirects for anonymous users, role isolation, cross-origin POST rejection, unsigned webhooks, the cron secret |
| `student` | Discovery, registration, the QR pass, behaviour when payments aren't configured, the receipt, certificate PDFs, public verification, uploads, access to other students' records |
| `organizer` | Hub pages and every event tab, forged QR codes, read-only faculty, cross-college isolation, scanner-only volunteers |
| `admin` | Metrics checked against the database, suspending and reactivating users with an audit trail, college isolation, every section, announcements, CSV exports |
| `links` | Every internal link on each role's pages resolves |
| `a11y` | axe-core WCAG 2 A/AA checks on the main pages of every role |
| `responsive` | No horizontal overflow at 320, 375, 768 and 1280px; mobile menus work |

## 18. Accessibility

- **Automated:** axe-core scans public, student, organizer and admin pages, and any serious or critical WCAG 2 A/AA violation fails the test.
- **Fixed during review:**
  - contrast failures;
  - invalid `aria-label` placement on star ratings and on the unread-notification dot;
  - invalid description-list markup;
  - unannounced loading states (now `role="status"`).
- **Built in:**
  - native form controls with labels, and errors linked to their fields;
  - skip-to-content links and visible focus rings;
  - Radix dialogs and menus with focus management;
  - an accessible table view for every trend chart;
  - `prefers-reduced-motion` respected.

## 19. Responsive design

The layout is mobile-first. It has been checked at 320, 375, 768, 1024, 1280 and 1440px, with overflow checked automatically at 320, 375, 768 and 1280px.

- **Navigation:** the app sidebar becomes a drawer on small screens, and the public site has its own mobile menu.
- **Tables:** they scroll inside their card, and the action columns stay pinned in view.
- **Long content:** long titles, names and emails wrap or truncate. The seed data includes such edge cases on purpose.

## 20. Known limitations

**Not verified against real third-party services**, because no credentials were available:

- **Razorpay:** a real test-mode checkout has not been run. Order creation, signatures, webhooks, capture and refunds are covered by integration tests (only Razorpay's HTTP API is mocked) and by signed-webhook checks against the production server.
- **Resend email:** without a key, emails are logged as `SKIPPED` in `email_logs`.
- **S3-compatible storage:** local storage is used outside production.

**Product limitations:**

- Signups do **not** verify the email address.
- There is no SSO or OAuth login.
- Registration is individual only: there are no team registrations and no waitlist.
- There are no SMS notifications; communication is in-app and email.
- There is no native mobile app; the platform is a responsive web app.
- Subscription plans and event limits are set by the super admin. There is no automated billing.
- "Save draft" in the event wizard requires every required field to be filled in.

**Security trade-off:** the Content Security Policy allows `'unsafe-inline'` scripts, because Next.js injects inline bootstrap scripts.

## 21. Deployment requirements

**Required services:**

- Node 20.9 or later.
- PostgreSQL 14 or later, with a pooled URL and a direct URL.
- Razorpay keys and a webhook secret, for paid events.
- Resend, for email.
- S3-compatible storage.
- A cron caller for `/api/cron/*`. `vercel.json` configures Vercel Cron.

**Deploy:**

1. Set the environment variables listed in `.env.example` and the README.
2. Run `npm run db:deploy`.
3. Build and start the app.
4. Point the Razorpay webhook at `/api/webhooks/razorpay`.

A `Dockerfile` is included for hosts other than Vercel.

## 22. Future improvements

These are candidate next steps. None of them is implemented.

- Verify email addresses at signup, and add Google or college SSO.
- Team registrations and waitlists.
- SMS or WhatsApp notification channels.
- Automated subscription billing.
- A nonce-based CSP.
- An offline-capable scanner for venues with poor connectivity.
- Certificate template editing in the UI; templates are data today.
- A native mobile app.
