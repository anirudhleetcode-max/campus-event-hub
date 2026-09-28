# Demo Guide: College Event Management Platform

**Team Apex Vision · Team 29 · 28-09-2026**

A live demo that takes 8–10 minutes. It runs entirely through the UI and needs **no database edits**.

The same script runs automatically as the Playwright suite `tests/e2e/demo-flow.spec.ts`.

---

## Presenting from the public URL (Render)

When the app is deployed (see README → *Hackathon deployment*), judges can follow along on their own devices:

- Share the `https://…onrender.com` URL and the demo accounts below. All passwords are `Demo@1234`.
- About **one minute before** you start, open the URL. The free plan sleeps after 15 idle minutes, and waking it takes up to a minute. If the scheduler workflow is set up, it stays awake anyway.
- Run `SMOKE_BASE_URL=<url> SMOKE_READ_ONLY=1 npm run test:smoke` beforehand as a quick check. It doesn't modify data.
- **Seeded dates are relative to when the database was seeded.** If that was more than a day ago, the "live" Robotics Expo will have ended. The main sequence below creates its own event and isn't affected. To refresh the seeded events, reset the demo data as described in the README. This wipes everything, including judges' test data.
- Several judges can use the same demo account at once. Only failed sign-ins count toward the lockout.
- Uploaded images don't survive a restart on the free plan. The demo doesn't need them.

The local steps below are needed only when presenting from your own machine.

## Before you present

1. **Start PostgreSQL** and seed fresh demo data **on the day**:

   ```bash
   npm run db:seed
   ```

   Seeded dates are relative to "now", so the Robotics Expo is always live and upcoming events stay upcoming.

2. **Run the production build:**

   ```bash
   npm run check:config    # optional: shows what is configured (no secrets printed)
   npm run build && npm start
   ```

   Then open <http://localhost:3000>.

3. **Open three browser windows**, using separate profiles or one incognito window, so you never have to log out on stage:

   | Window | Account | Password |
   |---|---|---|
   | Organizer | `organizer@northfield.demo` | `Demo@1234` |
   | College admin | `admin@northfield.demo` | `Demo@1234` |
   | Student | `student@northfield.demo` | `Demo@1234` |

   Keep a fourth, **logged-out** window for public certificate verification.

   Optional: the volunteer is `student5@northfield.demo`, who can use the scanner for the Robotics Expo only.

4. **Use a free event.** Razorpay keys are not configured, so a paid registration shows a "payments not configured" notice. It never fakes a payment.

5. **Camera scanning** needs `localhost` or HTTPS. On a laptop at `localhost` the webcam works. Otherwise use **manual entry** of the Registration ID shown on the student's pass; it goes through the same server checks.

6. Have `docs/Business_Model_Canvas_Apex_Vision.pptx` (or the PDF copy) open for the opening and closing.

---

## Demo sequence (about 9 minutes)

| # | Time | Who | Do this | Point out |
|---|---|---|---|---|
| 0 | 0:45 | — | BMC slide 1: the problem and the solution | Seven disconnected tools replaced by one platform |
| 1 | 1:30 | **Organizer** | *Events → Create event*. Name "Demo Day Workshop", category Workshop. **Starts later today** (2–3 hours ahead), Ends 2 hours after that, **Registration deadline** between now and the start. Venue "Seminar Hall 1", capacity 30, fee 0. Click **Next** to the review step, then **Save & submit for approval** | A 7-step wizard with validation; the event is not public while it's pending |
| 2 | 0:30 | **Admin** | *Events*, filter *Pending approval*, open the event, then **Approve & publish** | College approval workflow; the organizer is notified and the action is audited |
| 3 | 1:00 | **Student** | */events*, search "Demo Day", open the event, **Register Now**, then **Confirm registration** | Server-side search, live seat count, and an instant **QR pass** with a Registration ID |
| 4 | 0:30 | **Organizer** | Event, **Registrations** tab | The registration appears immediately; it can be exported as CSV |
| 5 | 1:00 | **Organizer** | Event, **Scan** tab. Scan the student's QR with the webcam, or type the Registration ID and click **Check in**. Then submit **the same ID again** | "Checked in", then **"Already checked in"**: duplicates are refused and the database allows only one attendance record |
| 6 | 0:30 | **Organizer** | Event page header: **Mark as ongoing**, then **Mark as completed** and confirm | Lifecycle control; completing sends every participant a feedback request |
| 7 | 0:45 | **Student** | Notification bell (feedback request), or *My registrations*, then **Give feedback**. Rate 4 stars on each of the five ratings and submit | Only participants can submit, and only once |
| 8 | 0:30 | **Organizer** | Event, **Certificates** tab, **Issue participation certificates** | Only people who **checked in** are eligible; no-shows get nothing |
| 9 | 0:45 | **Student**, then **public** | *My certificates*: download the PDF. Copy its ID (`CEH-2026-…`) and open `/verify/<ID>` in the logged-out window | A verifiable certificate with a QR code; no email or phone is shown publicly |
| 10 | 1:00 | **Organizer**, then **Admin** | Event **Analytics** tab: Registrations 1, Attendance 1, Certificates 1, Feedback rating 4.0 / 5. Then *Admin → Analytics* | Live numbers from one database, role-scoped dashboards, CSV and PDF reports |
| 11 | 0:45 | — | BMC slide 2 | The business model |

**If time is short:** skip step 2 by approving the seeded pending event "Campus Photography Walk" earlier. Or skip steps 1–2 and show check-in on the **live Robotics Expo**: the demo student is already registered and not yet checked in.

**Extra points if you are asked:**

- The volunteer `student5@northfield.demo` sees only the scanner, never the registrations or exports.
- `admin@riverside.demo` cannot see Northfield's data.
- `suspended@northfield.demo` cannot log in.

---

## What needs external credentials

| Feature | Needs | Without it |
|---|---|---|
| Online payments | Razorpay `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Paid registration is refused with a clear notice. Seeded demo payments are labelled "Demo". |
| Email (confirmations, reminders, feedback requests, certificates, refunds) | `EMAIL_API_KEY` (Resend) and a verified `EMAIL_FROM` domain | In-app notifications still work; emails are logged as `SKIPPED` |
| Cloud file storage | `STORAGE_*` (S3-compatible) | Local `.data/uploads` is used in development. Production needs S3. |
| Scheduled jobs in production | `CRON_SECRET` and a cron caller (Vercel Cron via `vercel.json`) | Organizers can still move events forward by hand; automatic reminders and status changes don't run |

Everything else needs only PostgreSQL and `AUTH_SECRET`: accounts, events, approval, registration, QR attendance, feedback, certificates, analytics and exports.

No real external service has been tested, because no keys were available:

- **Razorpay:** a live checkout has not been tested. The payment logic is covered by integration tests with Razorpay's API mocked.
- **Resend:** the email logic is covered by integration tests with Resend's API mocked.
- **Storage:** uploads were tested with the real AWS SDK against a local S3-compatible server, not a cloud bucket.

See *Production integration setup* in the README.
