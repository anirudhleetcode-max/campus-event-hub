import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/components/layout/nav-config";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/dashboard");
  if (user.role !== "SUPER_ADMIN" && user.role !== "COLLEGE_ADMIN") redirect(homeFor(user.role));
  return children;
}
