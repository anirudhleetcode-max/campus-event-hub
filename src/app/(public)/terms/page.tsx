import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { getSettings } from "@/server/services/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern the use of Campus Event Hub by students, organizers and colleges.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const { supportEmail } = await getSettings();
  return (
    <LegalPage
      title="Terms of Service"
      updated="2026-09-01"
      intro="These terms govern your use of Campus Event Hub. By creating an account or registering for an event you agree to them. If you use the platform on behalf of a college, you confirm you are authorised to do so."
      sections={[
        {
          heading: "Accounts",
          body: (
            <ul>
              <li>You must provide accurate information and keep your password confidential.</li>
              <li>You are responsible for activity under your account. Tell us immediately if you suspect unauthorised access.</li>
              <li>Staff roles (organizer, faculty coordinator, college admin) are granted by your college and may be withdrawn by it.</li>
            </ul>
          ),
        },
        {
          heading: "Events and registrations",
          body: (
            <>
              <p>
                Events are organised by colleges and their staff, not by Campus Event Hub. Each organizer is responsible for the event&apos;s content,
                eligibility rules, schedule and conduct. Please read an event&apos;s rules and terms before registering.
              </p>
              <p>
                A registration is confirmed only when you receive a confirmation and QR pass. Seats for paid events are held for a limited time while
                you complete payment and are released if payment is not completed. Passes are personal and may be checked in only once.
              </p>
            </>
          ),
        },
        {
          heading: "Payments and refunds",
          body: (
            <>
              <p>
                Fees for paid events are collected through Razorpay and are subject to Razorpay&apos;s terms. We do not store your card or banking
                details.
              </p>
              <p>
                Refunds follow the refund policy stated on each event page. If an event is cancelled, confirmed registrations are cancelled and
                captured payments are refunded to the original payment method. Refund timelines depend on your bank or payment provider.
              </p>
            </>
          ),
        },
        {
          heading: "Acceptable use",
          body: (
            <ul>
              <li>Do not create fraudulent events, registrations or payments, or impersonate another person or institution.</li>
              <li>Do not attempt to access data or areas you are not authorised to, or interfere with the platform&apos;s security or availability.</li>
              <li>Do not upload unlawful, offensive or infringing content.</li>
            </ul>
          ),
        },
        {
          heading: "Certificates",
          body: (
            <p>
              Certificates are issued by the organising college. Each carries a verification code that anyone can check. Certificates may be revoked by
              the issuing college, for example if issued in error; revoked certificates are shown as such on verification.
            </p>
          ),
        },
        {
          heading: "Availability and liability",
          body: (
            <p>
              We work to keep the platform available and secure but provide it &quot;as is&quot;. To the extent permitted by law, Campus Event Hub is not
              liable for the conduct of events or for indirect losses arising from use of the platform.
            </p>
          ),
        },
        {
          heading: "Suspension and termination",
          body: (
            <p>
              We or your college may suspend accounts that breach these terms. You may stop using the platform at any time and request deletion of your
              account as described in our <Link href="/privacy" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions about these terms? Email <a href={`mailto:${supportEmail}`} className="font-medium text-primary hover:underline">{supportEmail}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
