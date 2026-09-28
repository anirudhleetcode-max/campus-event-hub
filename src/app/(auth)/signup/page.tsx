import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { listPublicColleges } from "@/server/services/institutions";
import { getSettings } from "@/server/services/settings";
import { homeFor } from "@/components/layout/nav-config";
import { Alert } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { safeNextPath } from "@/lib/form-errors";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Get started", description: "Create your free student account on Campus Event Hub." };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeFor(user.role));

  const [settings, colleges] = await Promise.all([getSettings(), listPublicColleges()]);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Create your student account</h1>
        <p className="text-sm text-muted-foreground">Register for events, get your QR pass and collect certificates — all in one place.</p>
      </div>

      {!settings.allowStudentSignup ? (
        <div className="space-y-4">
          <Alert tone="warning" title="Sign-up is currently closed">
            Self sign-up has been disabled by the platform administrator. Please ask your college administrator to create an account for you.
          </Alert>
          <Link href="/login" className={buttonClasses("outline", "md", "w-full")}>
            Back to sign in
          </Link>
        </div>
      ) : colleges.length === 0 ? (
        <Alert tone="info" title="No colleges available yet">
          No institutions are accepting registrations right now. Please check back later or contact your college administrator.
        </Alert>
      ) : (
        <SignupForm colleges={colleges} next={next ?? undefined} />
      )}

      <p className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
        Organizer and admin accounts are created by your college administrator.
      </p>
    </div>
  );
}
