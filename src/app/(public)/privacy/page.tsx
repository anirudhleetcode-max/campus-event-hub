import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Campus Event Hub collects, uses, protects and retains personal data.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const { supportEmail } = await getSettings();
  return (
    <LegalPage
      title="Privacy Policy"
      updated="2026-09-01"
      intro="This policy explains what personal data Campus Event Hub collects when you use the platform, why we collect it, who we share it with and the choices you have. We collect only what is needed to run college events."
      sections={[
        {
          heading: "Data we collect",
          body: (
            <>
              <ul>
                <li><strong>Account data:</strong> your name, email address, phone number (optional), role, college, department, year of study and student ID where provided.</li>
                <li><strong>Registration data:</strong> the events you register for, answers to the organizer&apos;s registration questions, and your registration status.</li>
                <li><strong>Payment records:</strong> the amount, currency, Razorpay order and payment identifiers, and payment or refund status.</li>
                <li><strong>Attendance and feedback:</strong> when your pass was scanned, and ratings or comments you choose to submit.</li>
                <li><strong>Certificates:</strong> certificates issued to you and their verification codes.</li>
                <li><strong>Technical data:</strong> session information, IP address and browser user agent, used for security and abuse prevention.</li>
              </ul>
            </>
          ),
        },
        {
          heading: "How we use your data",
          body: (
            <ul>
              <li>To create and secure your account and sign you in.</li>
              <li>To register you for events, confirm your seat and issue your QR pass.</li>
              <li>To send confirmations, reminders and important updates such as venue or time changes and cancellations.</li>
              <li>To record attendance, collect feedback and issue verifiable certificates.</li>
              <li>To give organizers and college administrators the reports they need to run and evaluate events.</li>
            </ul>
          ),
        },
        {
          heading: "Payments",
          body: (
            <>
              <p>
                Payments for paid events are processed by <strong>Razorpay</strong>. You enter your card, UPI or net-banking details directly on
                Razorpay&apos;s secure checkout. <strong>Campus Event Hub never receives or stores your card number, CVV, UPI PIN or banking
                credentials.</strong>
              </p>
              <p>We store only the transaction references and status needed to confirm your registration, issue receipts and process refunds.</p>
            </>
          ),
        },
        {
          heading: "Who can see your data",
          body: (
            <ul>
              <li><strong>Event organizers and coordinators</strong> see the registration details of participants in their own events.</li>
              <li><strong>College administrators</strong> see data for events and users of their college.</li>
              <li><strong>Volunteers</strong> who scan passes see only what is needed to check you in.</li>
              <li><strong>Service providers</strong> such as Razorpay (payments) and our email delivery provider process data on our behalf.</li>
              <li>Anyone with a certificate&apos;s verification code can confirm the certificate&apos;s holder name, event and issue date.</li>
            </ul>
          ),
        },
        {
          heading: "Security",
          body: (
            <p>
              Passwords are stored as salted hashes, sessions are protected with secure HTTP-only cookies, access is checked on the server for every
              request, and sensitive administrative actions are recorded in an audit log. QR passes contain an opaque random token, not your personal
              details.
            </p>
          ),
        },
        {
          heading: "Retention",
          body: (
            <p>
              We keep registration, attendance, payment and certificate records for as long as your account is active and as required by your
              college&apos;s record-keeping and applicable tax and accounting law. Expired sessions and password reset tokens are deleted
              automatically. You may ask us to delete your account; records we are legally required to keep (such as payment records) are retained in
              restricted form.
            </p>
          ),
        },
        {
          heading: "Your choices and rights",
          body: (
            <p>
              You can view and update your profile at any time from your account. You may request access to,
              correction of, or deletion of your personal data by contacting us.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions about this policy? Email <a href={`mailto:${supportEmail}`} className="font-medium text-primary hover:underline">{supportEmail}</a>.
              See also our <Link href="/terms" className="font-medium text-primary hover:underline">Terms of Service</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
