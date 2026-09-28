import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M9 12.5A2.5 2.5 0 0 1 11.5 10h9A2.5 2.5 0 0 1 23 12.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 9 19.5z" fill="none" stroke="var(--primary-foreground)" strokeWidth="1.8" />
      <path d="M9 14.5h14M13 8.5v3M19 8.5v3" stroke="var(--primary-foreground)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20.5" cy="19" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label="Campus Event Hub home">
      <LogoMark />
      <span className="text-[15px]">
        Campus<span className="text-primary">Event</span>Hub
      </span>
    </Link>
  );
}
