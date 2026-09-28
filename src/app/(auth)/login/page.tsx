import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/components/layout/nav-config";
import { safeNextPath } from "@/lib/form-errors";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to Campus Event Hub." };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeFor(user.role));

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage your events, registrations and certificates.</p>
      </div>
      <LoginForm next={next ?? undefined} showDemoAccounts={process.env.APP_ENV !== "production"} />
    </div>
  );
}
