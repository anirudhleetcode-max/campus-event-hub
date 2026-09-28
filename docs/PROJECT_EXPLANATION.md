# Campus Event Hub — Project Explanation

**College Event Management Platform** · Team Apex Vision (Team 29) · 28-09-2026

This document explains the project for four kinds of readers:

- **Faculty member:** what it changes for the college.
- **Hackathon judge:** what problem it solves and why it is a real product.
- **Technical evaluator:** how it works and how it is kept correct.
- **Non-technical stakeholder:** what each person actually does in it.

It describes only what is implemented in this repository. For file-level detail and the verification results, see [`PROJECT_REVIEW.md`](PROJECT_REVIEW.md).

---

## 1. What problem are we solving?

A typical college event is run on six or seven unconnected tools:

- a Google Form for registrations;
- WhatsApp groups for announcements;
- Excel sheets for participant lists;
- a separate payment link, with payments checked against screenshots;
- paper sheets or roll calls for attendance;
- certificates made one by one in a design tool;
- a feedback form that few people fill in.

None of these tools know about each other. The same student's details get typed in again at every step, and mistakes creep in. Nobody can easily answer basic questions such as:

- Who paid?
- Who actually came?
- Who should get a certificate?
- Was the event any good?

## 2. Why are existing tools insufficient?

- **They don't share data.** Each tool is good at one job, but nothing connects registration to payment to attendance to certificates. Moving data between them is manual work.
- **They can't enforce rules.**
  - A form cannot stop the 101st person from registering for 100 seats.
  - A spreadsheet cannot tell whether a payment screenshot is genuine.
  - A paper sheet cannot stop a friend signing in for someone else.
- **They leave no reliable record.** It is hard to prove who attended or to verify that a certificate is real. There is no history of who changed what.
- **They give no overview.** College administration cannot see all events, approvals, revenue and participation in one place.

## 3. What is our solution?

**One web platform that runs the whole event lifecycle on one database:**

> create event → admin approval → publish → student registration → payment → notifications → QR attendance → feedback → certificates → analytics → reports

Because every step reads and writes the same records, **data entered once flows through the rest of the lifecycle**:

- A registration becomes a QR pass.
- The scan of that pass becomes an attendance record.
- The attendance record decides who is eligible for a certificate.
- All of it feeds the analytics dashboards and the CSV and PDF reports.

The platform is **multi-college**: each college has its own administrators, departments, events and data, and colleges cannot see each other's data.

## 4. Who uses the system?

| User | What they do |
|---|---|
| **Student** | Finds events, registers, pays, gets a QR pass, gives feedback, and downloads certificates |
| **Event organizer** (a club, committee or department) | Creates and runs events, manages registrations, checks people in, issues certificates, and reads analytics |
| **Volunteer** (usually a student) | Scans QR passes at the entrance. They can do this only for the event they are assigned to, and they have no other organizer access. |
| **Faculty coordinator** | Has a read-only view of the events they oversee |
| **College admin** | Approves events and manages users, departments and the college profile. Sees the college's analytics, payments and audit log. |
| **Super admin** | Manages all colleges, their subscription plans and platform settings |
| **Anyone** (for example, a recruiter) | Verifies a certificate on the public verification page. No account is needed. |

## 5. How does a student use it?

1. **Sign up** with their college and department, or log in.
2. **Discover events** on `/events`:
   - Search by event, college, department, category or organizer.
   - Filter by category, college, format, price and date.
   - See the number of seats left, which updates live.
3. **Register** on the event page. Required profile fields and any custom questions the organizer added are asked here.
   - **Free event:** the registration is confirmed immediately.
   - **Paid event:** the seat is held while the student pays through Razorpay (see §8).
4. **Get a QR pass.** It appears on the registration page, and the "Download pass" button prints it or saves it as a PDF from the browser. The student also gets an in-app notification, and an email when email is configured.
5. **Receive reminders** before the event: 7 days, 24 hours and 1 hour by default.
6. **At the venue,** the student shows the QR pass and is checked in. Their pass updates to "Checked in" live.
7. **Give feedback** after the event. The platform sends a feedback request, and the form has five 1–5 ratings plus comments.
8. **Get the certificate** under *My certificates*. The student can download the PDF and share its verification link.

The student can also:

- cancel a registration;
- see their payment receipts;
- manage their profile and profile photo.

## 6. How does an organizer use it?

1. **Create an event** with a 7-step wizard:
   - basics, then schedule;
   - venue, or an online link;
   - registration settings: capacity, fee and deadline;
   - media: banner and gallery;
   - rules, speakers, FAQs and custom questions;
   - review.
2. **Submit it for approval.** If the college does not require approval, the organizer publishes directly.
3. **Watch registrations come in.** The organizer can:
   - search and filter registrations;
   - see payment status;
   - issue full or partial refunds;
   - export the list as CSV.
4. **Assign staff:**
   - volunteers, who get the scanner only;
   - co-organizers, who get full management of the event;
   - faculty coordinators, who get read-only access.
5. **Check people in** at the event using the phone or laptop camera, or by typing the registration ID. The live attendance dashboard shows who has arrived.
6. **Run the event.** It moves to *ongoing* and *completed* automatically on schedule. The organizer can also mark it by hand from the event page. Completing the event sends every participant a feedback request.
7. **Issue certificates** in one click to everyone who checked in:
   - participation certificates;
   - winner, runner-up and speaker certificates to chosen people;
   - volunteer and organizer certificates to the staff.
8. **Review results:**
   - per-event analytics;
   - the feedback summary and comments;
   - CSV exports;
   - a downloadable PDF event report.

The organizer can also **duplicate, cancel or archive** an event. A cancellation requires a reason, and participants are notified.

## 7. How does an admin use it?

**A college admin:**

- **Approves events.** They review pending events and approve them, or send them back with a note. The organizer is notified either way.
- **Manages people:**
  - search users;
  - create users;
  - change roles;
  - suspend or reactivate accounts, which signs the user out immediately.
- **Manages the college:** its profile, logo and departments.
- **Oversees:** every event, payment, attendance record and certificate in their college, with college-wide analytics and CSV exports.
- **Communicates:** they send announcements to students, to staff or to one event's participants.
- **Audits:** the audit log records logins, approvals, payments and refunds, check-ins, certificates, role changes and exports.

**The super admin** does all of that across every college, and also:

- manages colleges;
- sets subscription plans and event limits;
- edits platform settings.

## 8. How does payment work?

Payments use **Razorpay** (Orders API, Checkout and webhooks).

1. The student registers for a paid event. Their seat is **held for 15 minutes** by default. This means an abandoned payment never locks up a seat for good.
2. The **server** creates a Razorpay order for the fee stored on the event. The browser never sends the amount, so it cannot be tampered with.
3. The student pays in Razorpay Checkout.
4. The server confirms the payment only after:
   - checking Razorpay's cryptographic signature;
   - **fetching the payment from Razorpay** and checking that the order, amount and currency match.
5. Razorpay also sends a signed **webhook**. Each webhook event is processed only once, even if Razorpay sends it again.

Steps 4 and 5 run the same locked capture routine. Whichever arrives first confirms the registration; the other does nothing.

- **Failed payment:** the student can retry while the hold lasts.
- **Payment after the hold expired and the seat was taken:** the money is **refunded automatically**. The event is never overbooked.
- **Refunds:** staff who manage the event can refund all or part of a payment.
- **Razorpay keys not configured:** paid registration is refused with a clear message. Payments are never faked.

## 9. How does QR attendance work?

1. Every confirmed registration gets a random, unguessable token. The QR code contains only `CEH1:<token>`, with no name, email or phone number.
2. The organizer or volunteer opens the event's **scanner page** and points the camera at the pass. If the camera cannot read it, they type the registration ID instead.
3. The server checks, in order:
   - that the scanner has access to this event;
   - that the token is real and belongs to this event;
   - that the registration is confirmed, which for a paid event means paid;
   - that the scan is inside the check-in window, from 24 hours before the start to 24 hours after the end.
4. **Duplicate scans are refused** with "Already checked in". The database also allows only one attendance record per registration. Even two phones scanning the same pass at the same moment record one check-in.
5. The attendance record stores:
   - the time;
   - the method (QR or manual);
   - who scanned it.

The attendance dashboard and the student's pass update live.

## 10. How are certificates generated?

- **Who can get one:**
  - Participation, winner and runner-up certificates go only to people who **actually checked in**. A no-show gets nothing.
  - Volunteer and organizer certificates go to event staff.
  - Speaker certificates go to the people the organizer chooses.
- **When:** once the event has started, or once the organizer has marked it ongoing or completed.
- **No duplicates:** issuing again skips anyone who already has that certificate.
- **The PDF** is generated on the server with pdf-lib, in A4 landscape. It contains:
  - the college logo, or its monogram;
  - the recipient's name, the event and the date;
  - the signatory;
  - a unique ID in the form `CEH-2026-XXXXXXXX`;
  - a QR code that links to the verification page.
- **Verification:** anyone can open `/verify/<ID>` and see whether the certificate is valid, who received it and for which event. Email and phone are never shown.
- **Revocation:** a revoked certificate shows as revoked on the verification page.
- **Downloads:** only the recipient, event staff and admins can download the PDF.

## 11. How does feedback work?

- **Who can give feedback:** only students with a confirmed registration, after the event has ended or has been marked completed.
- **The request:** when the event completes, whether automatically or by the organizer, every participant gets an in-app feedback request.
- **The form:** five ratings from 1 to 5 (overall, organization, venue, speakers, experience) plus optional comments and suggestions.
- **One per participant:** each participant can submit feedback once. The database enforces this.
- **What the organizer sees:**
  - the average of each rating;
  - how the overall ratings are distributed;
  - all the comments.

  Feedback can be exported as CSV, and the average rating appears in the event's analytics.

## 12. How do analytics work?

All numbers are **calculated live from the database**; nothing is hardcoded or estimated.

- **Dashboards:**
  - The super admin sees the whole platform.
  - A college admin sees their college.
  - An organizer sees their own events.
  - Each dashboard shows:
    - users, events and registrations;
    - revenue net of refunds;
    - check-ins and certificates.
  - There are daily or monthly trend charts, popular events, participation by department, and registrations by category.
  - A date range can be chosen: today, 7, 30 or 90 days, this year, or a custom range.
- **Per event:**
  - registrations, conversion rate, fill rate, attendance rate, no-show rate and revenue;
  - average rating and certificates issued;
  - a registration timeline and check-ins by hour.
- **Reports:** the numbers can be exported as CSV, and each event has a downloadable PDF report.

Every chart also has an accessible table view.

## 13. What makes the platform integrated?

Every stage of the event works on the **same records**, in the same order:

| Step | What it produces | What uses it next |
|---|---|---|
| Event | Capacity, fee, dates | Registration limits and the price charged |
| Registration | Student and answers | Payment and the QR pass |
| Payment | Confirms the registration | Revenue analytics and receipts |
| QR scan | Attendance record | Certificate eligibility and attendance analytics |
| Completion | Feedback request | Feedback form |
| Feedback | Ratings | Analytics and reports |
| Certificate | Verifiable PDF | Public verification page |

Because of this:

- **Nobody re-types data.** Details entered at registration flow to every later step.
- **The rules connect the steps:**
  - Only confirmed registrations can check in.
  - Only people who checked in get participation certificates.
  - Only participants can give feedback.
- **One place to see everything:** analytics and exports cover the entire lifecycle.

## 14. What security measures exist?

- **Login:**
  - Passwords are hashed with bcrypt.
  - Session cookies are secure: random tokens, `HttpOnly`, with only a hash stored in the database.
  - Suspending a user, changing their role or resetting their password signs them out everywhere.
  - Login errors never reveal whether an account exists.
- **Permissions checked on the server for every request.** Each page, form action and API checks the user's role, and for event pages whether they manage, view or can scan that specific event. Hiding a button is never the only protection.
- **No access to other people's data (IDOR protection):**
  - A student can only open their own registrations, payments and certificates.
  - An organizer can only open their own events.
  - An admin only sees their own college.
  - Automated tests try these attacks and expect them to be refused.
- **Payment safety:**
  - The server sets the amount.
  - Signatures are verified, and every payment is re-checked with Razorpay.
  - Webhooks are signed and processed only once.
- **Upload safety:**
  - Only real PNG, JPEG or WebP images are accepted, detected from the file's content. SVG is refused.
  - There are size and dimension limits.
- **Other protections:**
  - input validation on the server;
  - cross-site request checks;
  - rate limits on login, signup, password reset, payments, uploads and scanning;
  - security headers (CSP, HSTS, frame blocking);
  - redacted logs;
  - a full audit log.

## 15. What are the limitations?

**Not yet tested against the real external services**, because no credentials were available:

- **Razorpay:** a live test-mode checkout has not been run. The payment logic is covered by automated tests with Razorpay's API mocked.
- **Resend email:** without a key, emails are recorded as skipped.
- **Cloud file storage:** local storage is used instead.

**Not in the product today:**

- email verification at signup;
- Google or college single sign-on;
- team registrations and waitlists;
- SMS or WhatsApp notifications;
- a native mobile app. It is a responsive website that works on phones.
- automated subscription billing. Plans and event limits are set by the super admin.

**Known trade-offs:**

- "Save draft" in the event wizard needs all required fields filled in.
- The Content Security Policy allows inline scripts, because the framework needs them.

## 16. What could be added in future?

These are ideas only. **None of them is built yet.**

- Email verification and SSO (Google or the college's own login).
- Team registrations and waitlists.
- SMS or WhatsApp reminders.
- Automated subscription billing for colleges.
- A scanner that works offline at venues with poor internet.
- Certificate template designer in the UI.
- A stricter nonce-based Content Security Policy.
- A native mobile app.

---

### Running the demo

The live demo needs no database edits. The seed script creates demo accounts for every role; see the README for the logins. Run it in this order:

1. The organizer creates and submits an event.
2. The admin approves it.
3. The student finds the event and registers.
4. The organizer sees the registration and checks the student in. A second scan is refused as a duplicate.
5. The organizer marks the event ongoing, then completed.
6. The student gives feedback.
7. The organizer issues the certificate.
8. The student downloads the certificate and verifies it.
9. The organizer and the admin review the analytics.

The same script runs automatically as the `demo-flow` Playwright suite.
