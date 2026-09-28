import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/components/layout/nav-config";

/**
 * Staff land on their own dashboards. Doing this in the layout (outside the
 * page's loading boundary) makes it a real HTTP redirect rather than a
 * client-side one after streaming has started.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  if (user.role !== "STUDENT") redirect(homeFor(user.role));
  return children;
}
