# Campus Event Hub

**One platform for the complete college event lifecycle.** It replaces the usual mix of Google Forms, WhatsApp groups, spreadsheets, a separate payment page, paper attendance sheets and hand-made certificates.

```
Event creation → Publishing → Registration → Payment → Confirmation → QR pass
      → Attendance → Feedback → Certificate → Analytics & reports
```

Every step writes to one PostgreSQL database. Every permission is enforced on the server.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Getting started](#getting-started)
5. [Environment variables](#environment-variables)
6. [Database, migrations and seed data](#database-migrations--seed-data)
7. [Demo accounts](#demo-accounts)
8. [Testing](#testing)
9. [Razorpay setup (payments and webhooks)](#razorpay-setup)
10. [Storage setup](#storage-setup)
11. [Email setup](#email-setup)
12. [Scheduled jobs (reminders and status automation)](#scheduled-jobs)
13. [Deployment](#deployment)
14. [Production checklist](#production-checklist)
15. [Security model](#security-model)
16. [Troubleshooting](#troubleshooting)

---

## Features

| Area | What's included |
|---|---|
| **Roles and access** | Five roles (Super Admin, College Admin, Event Organizer, Faculty Coordinator, Student). There is a server-side permission map plus per-event access checks (owner, co-organizer, faculty coordinator, volunteer scanner). Menus change by role. |
| **Events** | A 7-step creation wizard: basics, schedule, venue, registration and custom questions, media, rules/speakers/FAQs, and review. Events can be saved as drafts, published, unpublished, duplicated, cancelled or archived. A state machine controls status (`DRAFT → PENDING_APPROVAL → PUBLISHED → REGISTRATION_OPEN → REGISTRATION_CLOSED → ONGOING → COMPLETED → ARCHIVED`, or `CANCELLED`) and rejects invalid transitions. A college can require admin approval before events go live. |
| **Discovery** | Server-side search across event name, college, department, category and organizer, backed by trigram indexes. Filters: category, college, department, date range, price, format and period. Sorting, pagination, skeleton loaders, and empty/error states. |
| **Registration** | Validated on both client and server. Required profile fields and custom questions are supported. Duplicate registrations are blocked, as are registrations after the deadline or when the event is full. **Seat allocation takes a row lock, so there is no overbooking**, even when two students race for the last seat. |
| **Payments** | A real Razorpay integration: orders are created on the server, the browser opens Checkout, the server verifies the HMAC signature **and** fetches the payment from Razorpay, and webhooks are signature-verified and deduplicated. Capture is idempotent. Refunds can be full or partial. Receipts and payment history are available to students. Payments can be in test, live or demo mode. |
| **Seat holds** | An unpaid registration holds a seat for a configurable time (15 minutes by default). Abandoned or failed payments release the seat automatically. If a payment arrives after its hold expired and the seat has since been taken, it is **refunded automatically**, not overbooked. |
| **QR attendance** | Each confirmed registration gets an opaque random QR token that contains no personal data. The scanner uses the device camera (jsQR) and has a manual-entry fallback. The server rejects forged passes, passes for another event, unpaid or cancelled registrations, and duplicate check-ins (a unique constraint also guards against races). The attendance dashboard updates live. |
| **Certificates** | Types: participation, winner, runner-up, volunteer, organizer and speaker. Each certificate is an A4 PDF with the college logo, an event mark, the recipient, event, date, certificate ID, signature and a verification QR code. Anyone can verify a certificate at `/verify/[id]`; private data is not shown. Certificates can be revoked. |
| **Notifications** | An in-app notification centre with a live unread count, read/unread state, and "mark all as read". There is an email abstraction (Resend) for confirmations, receipts, reminders and certificates. Admins and organizers can send announcements. |
| **Reminders** | Scheduled reminders go out at configurable offsets (7 days, 24 hours and 1 hour by default) to confirmed participants only. They are idempotent. |
| **Feedback** | Once an event ends, each participant can submit one rating across five dimensions plus comments. Organizers see the aggregated results. |
| **Analytics** | Admin, organizer and per-event analytics, all computed from the database: registrations, revenue, attendance, conversion rate, no-show rate, ratings and certificates. Includes trend charts, popular events, department and category breakdowns, and date-range filters (today, 7 days, 30 days, 90 days, this year, or a custom range). |
| **Exports** | CSV exports for registrations, payments, attendance, certificates, feedback and analytics. Cells that look like spreadsheet formulas are neutralised. Each event also has a PDF report. |
| **Admin** | Users (search, filter, create, change role, suspend or reactivate, view activity), colleges (profile, subscription, suspend institution), departments, payments and the refund queue, attendance, certificates, announcements, audit logs and platform settings. |
| **Realtime** | Live remaining seats, attendance counters and recent check-ins, notification badge, payment confirmation, and dashboard metrics. Powered by Postgres `LISTEN/NOTIFY` and Server-Sent Events. |
| **UX** | Responsive from 320px to 1920px, light, dark and system themes, accessible components (labels, focus states, ARIA, keyboard navigation, confirmation dialogs), and toasts. |
| **SEO** | Metadata, Open Graph, Twitter cards, `sitemap.xml`, `robots.txt`, and schema.org `Event` JSON-LD on event pages. |

## Architecture

```
┌──────────────────────────────── Next.js 16 (App Router, Node runtime) ───────────────────────────────┐
│                                                                                                      │
│  Server Components (pages) ──┐                                                                       │
│  Server Actions (forms)  ────┼──►  src/server/services/*  ──►  Prisma  ──►  PostgreSQL               │
│  Route Handlers (/api/*) ────┘        │  (business rules,           (row locks, unique                │
│        │                              │   permissions, audit)        constraints, CHECKs)            │
│        │                              ├──► Razorpay API (orders, fetch, capture, refunds)            │
│        │                              ├──► Resend (email)      ├──► S3-compatible storage            │
│        │                              └──► pg_notify ──► LISTEN (one per instance) ──► SSE clients   │
│  proxy.ts: optimistic auth redirect (real checks happen in every page/action/handler)                │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
      ▲ Razorpay webhooks  → /api/webhooks/razorpay (HMAC verified, idempotent)
      ▲ Cron (Vercel Cron) → /api/cron/{event-status,reminders,cleanup} (Bearer CRON_SECRET)
```

```
src/
├── app/
│   ├── (public)/        landing, events, event details, registration + checkout, verify, legal
│   ├── (auth)/          login, signup, forgot/reset password
│   ├── (app)/           authenticated area (AppShell)
│   │   ├── dashboard, my/*, notifications, profile      student + shared
│   │   ├── organizer/*                                  organizer / faculty / volunteer scanner
│   │   └── admin/*                                      college & platform administration
│   ├── actions/         server actions (validated, return ActionResult)
│   └── api/             payments, webhooks, realtime (SSE), attendance scan, exports, uploads, cron, health
├── server/              server-only: db, env, auth (sessions, RBAC), services, payments, pdf, realtime, storage, mailer
├── components/          ui kit, layout, charts, events, organizer, scanner, payments, realtime
└── lib/                 shared pure code: validators (zod), event state machine, labels, formatting
prisma/                  schema, migrations, seed
tests/                   unit + integration (vitest, real Postgres) and e2e (Playwright)
```

### Key design decisions

- **Sessions are stored in the database, not in JWTs.** Tokens are 256-bit random values kept in an `HttpOnly`, `Secure` (in production), `SameSite=Lax` cookie. The database stores only an HMAC of each token. Suspending a user, changing their role or resetting their password revokes their sessions immediately. Passwords are hashed with bcrypt (cost 12). The auth code is small and fully under our control. Auth.js could be added later for OAuth providers.
- **Seat allocation** runs in a transaction that locks the event row with `SELECT … FOR UPDATE`, then counts `CONFIRMED` registrations plus unexpired `PENDING_PAYMENT` holds. Because an expired hold stops counting automatically, a failed payment can never consume a seat permanently. A `UNIQUE(event_id, user_id)` constraint is the last line of defence.
- **Payment capture is idempotent.** The checkout callback and the webhook both call `markPaymentCaptured`, which locks the payment row. Whichever arrives first confirms the registration; the second is a no-op. Webhooks are also deduplicated with `UNIQUE(gateway_event_id)`.
- **Realtime** uses `pg_notify` from the same database transaction path, fanned out to Server-Sent Events. It needs no extra infrastructure and works across serverless instances; browsers reconnect automatically when a function times out. Normal CRUD stays on plain requests.
- **Time is authoritative for registration windows.** A stale stored status can never extend a deadline. A cron job advances statuses for display and triggers side effects such as feedback requests.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 with CSS-variable design tokens (light and dark), Radix primitives, lucide icons, Geist font |
| Database | PostgreSQL 16, Prisma ORM 6 with migrations |
| Auth | Custom DB-backed sessions and bcrypt, RBAC |
| Payments | Razorpay (Orders API, Checkout, signature verification, webhooks, refunds) |
| Realtime | Postgres `LISTEN/NOTIFY` → Server-Sent Events |
| Files | S3-compatible storage (AWS S3, Cloudflare R2, Supabase Storage S3, MinIO); local disk in development |
| Email | Resend HTTP API (pluggable provider) |
| PDFs and QR codes | pdf-lib, qrcode; jsQR for camera scanning |
| Charts | Recharts |
| Tests | Vitest (unit and integration against real Postgres), Playwright (end-to-end) |

## Getting started

**Prerequisites:** Node.js 20.9 or later (22 recommended), npm 10, and PostgreSQL 14 or later (16 recommended). The `pg_trgm` extension is created by the migration.

```bash
git clone <repo> campus-event-hub && cd campus-event-hub
npm install                     # also runs `prisma generate`
cp .env.example .env            # fill in DATABASE_URL, AUTH_SECRET (openssl rand -base64 32)

# Create the database (example for a local Postgres)
createdb campus_hub

npm run db:deploy               # apply migrations
npm run db:seed                 # demo data (optional but recommended)
npm run dev                     # http://localhost:3000
```

Or start Postgres with Docker:

```bash
docker run -d --name campus-pg -e POSTGRES_USER=campus -e POSTGRES_PASSWORD=campus -e POSTGRES_DB=campus_hub -p 5432:5432 postgres:16
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Production build / start |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit and integration tests (uses a separate `campus_hub_test` database) |
| `npm run test:e2e` | Playwright end-to-end tests (needs a seeded database and a production build) |
| `npm run db:migrate` | Create or apply a **development** migration (`prisma migrate dev`) |
| `npm run db:deploy` | Apply migrations in **staging or production** (`prisma migrate deploy`) |
| `npm run db:seed` | Load demo data. It **wipes existing data** and refuses to run when `APP_ENV=production` |
| `npm run db:reset` | Drop, re-migrate and seed the development database |

## Environment variables

See [`.env.example`](./.env.example). Use **separate values for development, staging and production**, and never share keys between them.

| Variable | Required | Notes |
|---|---|---|
| `APP_ENV` | yes | `development`, `staging` or `production`. Controls demo hints and seed protection. |
| `DATABASE_URL` | yes | Pooled connection string (a PgBouncer or Neon pooler URL is fine). |
| `DIRECT_DATABASE_URL` | yes | Direct, non-pooled connection, used for migrations and realtime `LISTEN`. |
| `AUTH_SECRET` | yes | 32+ random characters, used to HMAC session and reset tokens. Rotating it signs everyone out. |
| `CRON_SECRET` | yes (prod) | Bearer token required by `/api/cron/*`. |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin. Used in emails, certificate QR codes and CSRF origin checks. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for paid events | Use `rzp_test_…` keys outside production. The key secret never leaves the server. |
| `RAZORPAY_WEBHOOK_SECRET` | for paid events | The secret you set on the Razorpay webhook. |
| `EMAIL_API_KEY`, `EMAIL_FROM` | recommended | Resend API key and a verified sender. Without them, emails are recorded in `email_logs` as `SKIPPED`. |
| `STORAGE_URL`, `STORAGE_KEY`, `STORAGE_SECRET`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_PUBLIC_URL` | yes (prod) | S3-compatible storage. Without them, non-production uploads are stored in `.data/uploads` and served by `/uploads/*`; uploads are disabled in production. |
| `NEXT_PUBLIC_TIMEZONE` | no | Display and input timezone. Defaults to `Asia/Kolkata`. |
| `LOG_LEVEL` | no | `debug`, `info`, `warn` or `error`. |

Environment variables are validated when first used (`src/server/env.ts`), so a misconfiguration fails loudly with a clear message.

## Database, migrations and seed data

- The schema is in [`prisma/schema.prisma`](./prisma/schema.prisma). It has 27 tables: users, sessions, colleges, departments, subscriptions, event categories and venues, events, questions, speakers, volunteers, registrations and answers, payments, payment webhooks, attendance, certificate templates, certificates, feedback, notifications, announcements, reminder and email logs, audit logs, system settings and rate limits. It uses UUID keys, foreign keys and indexes, and soft deletes on users, colleges, departments and events. Roles are a Postgres enum; their permissions live in code (`src/server/auth/permissions.ts`).
- Migrations are in `prisma/migrations`. The initial migration also adds constraints Prisma can't express: `CHECK` constraints (capacity > 0, fee ≥ 0, end after start, deadline before end, ratings between 1 and 5, refund ≤ amount) and trigram (`pg_trgm`) GIN indexes for search.
- **Development:** `npm run db:migrate -- --name <change>` creates a new migration after you edit the schema.
- **Staging and production:** `npm run db:deploy`. Never hand-edit a production database.
- **Seed:** `npm run db:seed` creates 2 colleges, 8 departments, 13 events in every lifecycle state (upcoming, ongoing, completed, draft, pending approval, cancelled), about 440 registrations, payments, attendance, feedback, certificates and notifications. Dates are relative to the current time, so the demo always has live events.

> **Demo payments** are seeded with `mode = DEMO` and IDs prefixed `demo_`. They never touched a gateway, they are labelled "Demo" throughout the UI, and they cannot be refunded.

## Demo accounts

All demo accounts use the password **`Demo@1234`**. They exist only in seeded development or staging databases.

| Role | Email | Try this |
|---|---|---|
| Student | `student@northfield.demo` | Dashboard, QR passes, certificates, payments, feedback |
| Event organizer | `organizer@northfield.demo` | Create an event, scan attendance (the Robotics Expo is live), issue certificates |
| Faculty coordinator | `faculty@northfield.demo` | Read-only view of assigned events and reports |
| College admin | `admin@northfield.demo` | Approve the pending "Campus Photography Walk", manage users and departments |
| Super admin | `super@demo.campushub.app` | Every college, subscriptions, platform settings |
| Riverside admin / organizer | `admin@riverside.demo`, `organizer@riverside.demo` | Shows that each college's data is isolated from the other |
| Suspended user | `suspended@northfield.demo` | Sign-in is refused |

## Testing

```bash
npm test          # vitest: unit + integration against a real Postgres (campus_hub_test is created automatically)
npm run build && npm run test:e2e   # playwright: full user journeys against the production build
```

**End-to-end tests** (`tests/e2e`, 52 tests) run against `next start` on a dedicated database. By default this is `campus_hub_e2e`; override it with `E2E_DATABASE_URL`.

#### How the E2E database is prepared (and why not in `globalSetup`)

Playwright starts its `webServer` **before** `globalSetup` runs. Preparing the database in `globalSetup` would therefore start Next.js against a database that doesn't exist yet. Instead, `playwright.config.ts` makes preparation part of the web server command:

```
npx tsx tests/e2e/prepare-db.ts && npx next start -p 3100
   │  1. create campus_hub_e2e if missing
   │  2. prisma migrate deploy
   │  3. seed deterministic demo data (wipes the E2E DB only)
   └─ 4. start Next.js with DATABASE_URL / DIRECT_DATABASE_URL = E2E database
Playwright waits for /api/health → runs the tests
```

- **Safety:** `prepare-db.ts` refuses to reset any database whose name doesn't contain `e2e`, and any database that `.env` configures as your development database.
- **Clock:** the web server gets its own `CRON_SECRET`. Tests advance an event's time by moving its timestamps, then call the real `/api/cron/event-status` endpoint, so status automation is exercised rather than faked.
- **Fresh data:** each run re-seeds the database, and the tests don't depend on data left behind by earlier runs.

#### What the suites cover

- **`lifecycle`:** one event through the whole product.
  - The organizer creates it in the wizard and submits it; it isn't public while pending.
  - An admin approves it and it goes live, with an audit entry and a notification.
  - Two students find it by search and register.
  - On event day the organizer scans a pass with a **fake webcam playing the real QR code**, so the camera path and jsQR decoding are tested. A duplicate scan is refused.
  - The cron marks the event completed and sends feedback requests; the attendee submits feedback once.
  - Certificates are issued to the attendee only, not the no-show. The student downloads the PDF and it verifies publicly.
  - Organizer analytics show 2 registrations, 1 attended and a 50% no-show rate. The CSV and PDF report are checked, and admin analytics are reviewed.
- **`auth`:** redirects for anonymous users, role isolation, cross-origin POST rejection, unsigned webhooks, and the cron secret.
- **`student`:** the discovery → registration → QR pass journey, and the behaviour when payments aren't configured (clear notice, no seat hold, no payment). Also the receipt, certificate PDF, public verification, uploads (disguised SVG, forbidden kind and path traversal refused), and blocked access to other students' records.
- **`organizer`:** every hub page and every event tab, forged QR payloads, read-only faculty access, and cross-college isolation (pages, all CSV exports, the PDF report, scanning, hub listings). Also scanner-only access for student volunteers.
- **`admin`:** dashboard metrics checked against the database, suspending and reactivating users with an audit trail, college isolation, every section, announcements, and CSV export.
- **`links`:** crawls every internal link on each role's main pages, including event-table rows and pagination, and fails on any 4xx/5xx.
- **`a11y`:** axe-core WCAG 2 A/AA checks on public, student, organizer and admin pages. Serious or critical violations fail the test.
- **`responsive`:** no horizontal overflow at 320, 375, 768 and 1280px, and the mobile menus work.

To use a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_PATH` (or `PLAYWRIGHT_BROWSERS_PATH`).

The integration tests run against Postgres (see `vitest.config.mts`; override with `TEST_DATABASE_URL`). They cover:

- **Concurrency:** two students racing for the last seat (exactly one succeeds), and 20 students racing for 5 seats (no overbooking). The race tests fail if the row lock is removed.
- Registration rules: duplicates, deadline, capacity, non-students, required fields and custom questions, cancel and re-register, and seat holds that expire.
- **Payments:** order creation and reuse, ownership checks, checkout signature verification, forged signatures, amount mismatch, webhook processing, **webhook replay idempotency**, checkout and webhook arriving together (confirmed once), invalid webhook signatures, failed payments, a late payment on a full event being auto-refunded, the refund lifecycle, and refund authorization.
- Event lifecycle: RBAC (students, other organizers, other colleges), the approval workflow, invalid transitions, capacity and fee invariants, cancellation cascading to registrations, and duplication.
- **Attendance:** valid, duplicate, forged and wrong-event scans; concurrent scans of the same pass; unpaid and cancelled registrations; unauthorised scanners; volunteer scanners.
- Feedback eligibility and duplicate prevention; certificate issuance limited to attendees, public verification, PDF rendering, access control and revocation.
- Reminder idempotency, time-driven status automation, analytics accuracy, and export scoping.
- Unit tests: the state machine, RBAC matrix, signature helpers, CSV injection protection, log redaction, QR parsing, image type sniffing, validators, and timezone parsing.

Only the Razorpay HTTP API is mocked in tests. Signatures are computed exactly as Razorpay computes them, and all verification code runs unmodified.

## Razorpay setup

1. Create a Razorpay account and switch the dashboard to **Test Mode**.
2. **Settings → API Keys → Generate Test Key.** Put the key ID in `RAZORPAY_KEY_ID` and the secret in `RAZORPAY_KEY_SECRET`.
3. **Settings → Payment capture:** automatic capture is recommended. The app also captures `authorized` payments itself.
4. **Settings → Webhooks → Add new webhook:**
   - URL: `https://<your-domain>/api/webhooks/razorpay`
   - Secret: a random string, also stored in `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `payment.failed`, `payment.authorized`, `order.paid`, `refund.processed`, `refund.failed`
   - For local development, expose your dev server with a tunnel (for example `cloudflared tunnel --url http://localhost:3000`) and use the tunnel URL.
5. Test with Razorpay's [test cards and UPI IDs](https://razorpay.com/docs/payments/payments/test-card-details/) (for example UPI `success@razorpay`).
6. For production, generate **Live** keys and a separate live webhook, and set them only in the production environment. The app detects live mode from the `rzp_live_` prefix and records the mode on every payment.

How a payment flows:

1. `POST /api/payments/order` creates a Razorpay order for your pending registration.
2. The browser opens Checkout.
3. `POST /api/payments/verify` checks the HMAC signature, fetches the payment from Razorpay, compares the amount and currency, and confirms the registration.
4. The webhook later confirms the same payment independently. That second confirmation is a no-op.

## Storage setup

Uploads (event banners and galleries, college logos, profile pictures, certificate signatures) are checked by **magic bytes** (PNG, JPEG or WebP only; SVG is rejected), size and pixel dimensions. They are then stored in S3-compatible storage. Only URLs are kept in Postgres.

- **Cloudflare R2:** `STORAGE_URL=https://<account>.r2.cloudflarestorage.com`, `STORAGE_REGION=auto`, a public bucket or custom domain in `STORAGE_PUBLIC_URL`.
- **AWS S3:** leave `STORAGE_URL` empty, set `STORAGE_REGION`, and use a bucket policy or CloudFront for public reads.
- **Supabase Storage:** use the S3 endpoint `https://<project>.supabase.co/storage/v1/s3` and a public bucket URL.

The storage origin is added to the Content Security Policy automatically from `STORAGE_PUBLIC_URL`. The CSP is computed in `next.config.ts`, so **`STORAGE_PUBLIC_URL` must be set at build time** as well as at runtime.

## Email setup

1. Create a [Resend](https://resend.com) account and verify your sending domain.
2. Set `EMAIL_API_KEY` and `EMAIL_FROM="Campus Event Hub <events@yourdomain.com>"`.

The app sends email for registration confirmation, payment receipts, reminders, certificates, cancellations and venue changes, password resets, and optional announcements. Every attempt is recorded in `email_logs`. Email failures never break the user action, because the in-app notification is the source of truth. To use another provider, implement the `EmailProvider` interface in `src/server/mailer.ts`.

## Scheduled jobs

| Endpoint | Schedule (vercel.json) | Purpose |
|---|---|---|
| `/api/cron/event-status` | every 5 min | Advance statuses as time passes (open, close, ongoing, completed), send feedback requests, expire abandoned holds |
| `/api/cron/reminders` | every 15 min | Send reminders at the configured offsets (7 days, 24 hours, 1 hour by default; set in Admin → Settings) |
| `/api/cron/cleanup` | daily | Purge expired sessions, reset tokens and rate-limit windows |

Each endpoint requires `Authorization: Bearer $CRON_SECRET`. Vercel Cron sends this automatically when `CRON_SECRET` is set. On other hosts, call the endpoints from any scheduler:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/reminders
```

## Deployment

### Vercel with managed Postgres (recommended)

1. Provision Postgres: Neon, Supabase, Vercel Postgres, RDS or similar. Use the **pooled** URL for `DATABASE_URL` and the **direct** URL for `DIRECT_DATABASE_URL`.
2. Import the repository into Vercel and set every production environment variable (`APP_ENV=production`, `NEXT_PUBLIC_APP_URL=https://your-domain`).
3. The build command in `vercel.json` runs `prisma migrate deploy && npm run build`, so migrations apply on every deploy.
4. Add your domain in Vercel. HTTPS is automatic, and HSTS is sent by the app.
5. Configure the Razorpay **live** webhook to point at `https://your-domain/api/webhooks/razorpay`.
6. Cron jobs come from `vercel.json`. Five-minute schedules need a Vercel Pro plan; on Hobby, lower the frequency or use an external scheduler.
7. Check `https://your-domain/api/health`. It returns `{"status":"ok","database":"up",…}`.

Use a **separate Vercel environment (Preview or Staging) with its own database and Razorpay test keys** for staging.

### Any Node host (Docker, VM, Railway, Render, Fly)

```bash
npm ci && npx prisma migrate deploy && npm run build && npm start   # port 3000
```

Put the app behind HTTPS and forward `x-forwarded-for`, `x-forwarded-host` and `x-forwarded-proto`. Server-Sent Events need proxy buffering disabled; the app sends `X-Accel-Buffering: no` for nginx.

## Production checklist

- [ ] `APP_ENV=production`, a unique `AUTH_SECRET` and `CRON_SECRET`, and the correct `NEXT_PUBLIC_APP_URL`
- [ ] Migrations applied with `npm run db:deploy`. **Do not seed** production.
- [ ] Create the first super admin (for example with `npx prisma studio`, or a one-off script using `hashPassword`), then create colleges and admins in the UI
- [ ] Razorpay **live** keys, live webhook with its secret, and a test payment of ₹1 refunded end to end
- [ ] Email domain verified; send a test via "Forgot password"
- [ ] Object storage configured, and `STORAGE_PUBLIC_URL` reachable
- [ ] Cron jobs running (check the logs for `Cron job completed`)
- [ ] `GET /api/health` is healthy; uptime monitoring and log drain configured
- [ ] Database backups and point-in-time recovery enabled
- [ ] Security headers verified (for example with securityheaders.com)

## Security model

- **Authentication:** bcrypt passwords; HMAC-hashed DB session tokens in `HttpOnly`, `SameSite=Lax`, `Secure` cookies; sessions revoked on suspension, role change and password reset; login rate limits per IP and per email; no user enumeration (constant-time dummy hash, generic errors).
- **Authorization:** every page, server action and route handler checks the user on the server. `proxy.ts` only redirects early for convenience. Event-level access is computed per request, and admin data is scoped to the admin's college.
- **Input:** zod schemas shared by client and server, where the server's result is final. Prisma parameterises every query; the few raw SQL queries use tagged templates.
- **XSS:** React escaping everywhere; user text is rendered as text, never HTML; SVG uploads are rejected; JSON-LD escapes `<`; the CSP sets `frame-ancestors 'none'` and `object-src 'none'`.
- **CSRF:** Server Actions get Next.js origin checks. Cookie-authenticated JSON endpoints verify the `Origin` header. Cookies use `SameSite=Lax`.
- **Payments:** only the server knows the secret keys; checkout signatures and webhook signatures are verified with timing-safe comparisons; amounts are cross-checked with Razorpay; webhook processing is idempotent.
- **Rate limiting:** a Postgres-backed fixed window that is shared across instances. It covers login (10 attempts per account and 200 per IP per 15 minutes), signup, password reset, payment orders and verification, uploads, and scanning. The per-IP limits are deliberately generous because a whole campus often shares one NAT address; the per-account limit is what stops password guessing.
- **Logging:** structured JSON logs with automatic redaction of passwords, secrets, tokens and signatures. An audit log records logins, event changes, payments and refunds, attendance edits, certificates, role and status changes, settings changes and exports.
- **Headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera only on our own origin, for the scanner).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid server environment: AUTH_SECRET…` | Set `AUTH_SECRET` to 32 or more characters. |
| "Online payment is unavailable" on a paid event | Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` and restart the server. Until then, paid registration is refused up front, so no seat is held for a payment that can't happen. Free events work without Razorpay. |
| Payment succeeded but the registration is still pending | Check that the webhook URL is reachable and that `RAZORPAY_WEBHOOK_SECRET` matches. Look at the `payment_webhooks` table (`status`, `error`). The registration page updates live when the webhook lands. |
| Realtime indicator stays on "Connecting…" | `DIRECT_DATABASE_URL` must be a direct (non-PgBouncer) connection so `LISTEN` works. Behind nginx, disable proxy buffering for `/api/realtime`. |
| The camera doesn't start on the scanner | Browsers only allow camera access over HTTPS or on localhost. Grant permission, or use manual entry. |
| Uploads fail in production | Configure the `STORAGE_*` variables. The local-disk fallback is disabled in production by design. |
| `npm test` can't connect | Start Postgres, and set `TEST_DATABASE_URL` if your credentials differ from `campus:campus@localhost`. |
| Reminders aren't sent | Check that the cron job is calling `/api/cron/reminders` with the right secret, and look at `reminder_logs` and `email_logs`. |
