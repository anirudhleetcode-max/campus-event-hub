import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { buttonClasses } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" && sp.token.length >= 20 && sp.token.length <= 200 ? sp.token : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">For your security, you&apos;ll be signed out of all other devices after resetting.</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="danger" title="This reset link is invalid">
            The link is missing or incomplete. Please request a new password reset email.
          </Alert>
          <Link href="/forgot-password" className={buttonClasses("primary", "md", "w-full")}>
            Request a new link
          </Link>
        </div>
      )}
    </div>
  );
}
