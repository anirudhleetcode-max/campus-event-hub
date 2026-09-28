import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/server/auth/session";
import { unreadCount } from "@/server/services/communications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const unread = await unreadCount(user.id);
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl, collegeName: user.collegeName }} unread={unread}>
      {children}
    </AppShell>
  );
}
