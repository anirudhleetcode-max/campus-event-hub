import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { homeFor } from "@/components/layout/nav-config";

/** The "My …" area is the student's personal space; staff are sent to their own home. */
export default async function StudentAreaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect(homeFor(user.role));
  return children;
}
