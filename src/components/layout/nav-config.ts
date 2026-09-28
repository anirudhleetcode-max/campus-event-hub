import type { Role } from "@prisma/client";
import {
  Award, BarChart3, Bell, Building2, CalendarDays, ClipboardList, CreditCard, FileClock, LayoutDashboard, Megaphone,
  MessageSquareText, QrCode, Settings, Ticket, UserRound, Users, Layers, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

const student: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/events", label: "Explore Events", icon: CalendarDays },
      { href: "/my/registrations", label: "My Registrations", icon: Ticket },
      { href: "/my/attendance", label: "My Attendance", icon: QrCode },
      { href: "/my/certificates", label: "Certificates", icon: Award },
      { href: "/my/payments", label: "Payments", icon: CreditCard },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/profile", label: "Profile", icon: UserRound },
    ],
  },
];

const organizer: NavGroup[] = [
  {
    items: [
      { href: "/organizer/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/organizer/events", label: "My Events", icon: CalendarDays },
      { href: "/organizer/registrations", label: "Registrations", icon: ClipboardList },
      { href: "/organizer/attendance", label: "Attendance", icon: QrCode },
      { href: "/organizer/certificates", label: "Certificates", icon: Award },
      { href: "/organizer/feedback", label: "Feedback", icon: MessageSquareText },
      { href: "/organizer/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  { label: "Account", items: [{ href: "/notifications", label: "Notifications", icon: Bell }, { href: "/profile", label: "Profile", icon: UserRound }] },
];

const faculty: NavGroup[] = [
  {
    items: [
      { href: "/organizer/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/organizer/events", label: "Assigned Events", icon: CalendarDays },
      { href: "/organizer/registrations", label: "Registrations", icon: ClipboardList },
      { href: "/organizer/attendance", label: "Attendance", icon: QrCode },
      { href: "/organizer/analytics", label: "Reports", icon: BarChart3 },
      { href: "/verify", label: "Verify Certificate", icon: Award },
    ],
  },
  { label: "Account", items: [{ href: "/notifications", label: "Notifications", icon: Bell }, { href: "/profile", label: "Profile", icon: UserRound }] },
];

const admin = (role: Role): NavGroup[] => [
  {
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/events", label: "Events", icon: CalendarDays },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/colleges", label: role === "SUPER_ADMIN" ? "Colleges" : "College Profile", icon: Building2 },
      { href: "/admin/departments", label: "Departments", icon: Layers },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      { href: "/admin/attendance", label: "Attendance", icon: QrCode },
      { href: "/admin/certificates", label: "Certificates", icon: Award },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/notifications", label: "Announcements", icon: Megaphone },
      { href: "/admin/audit-logs", label: "Audit Logs", icon: FileClock },
      ...(role === "SUPER_ADMIN" ? [{ href: "/admin/settings", label: "Settings", icon: Settings }] : []),
    ],
  },
  { label: "Account", items: [{ href: "/notifications", label: "Notifications", icon: Bell }, { href: "/profile", label: "Profile", icon: UserRound }] },
];

export function navFor(role: Role): NavGroup[] {
  switch (role) {
    case "SUPER_ADMIN":
    case "COLLEGE_ADMIN":
      return admin(role);
    case "EVENT_ORGANIZER":
      return organizer;
    case "FACULTY_COORDINATOR":
      return faculty;
    default:
      return student;
  }
}

export function homeFor(role: Role): string {
  if (role === "SUPER_ADMIN" || role === "COLLEGE_ADMIN") return "/admin/dashboard";
  if (role === "EVENT_ORGANIZER" || role === "FACULTY_COORDINATOR") return "/organizer/dashboard";
  return "/dashboard";
}
