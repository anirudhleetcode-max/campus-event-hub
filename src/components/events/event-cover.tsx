import { CalendarDays, Code2, Dumbbell, Megaphone, Mic2, Music2, Presentation, Trophy, Wrench, BookOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  technical: Code2, hackathon: Trophy, workshop: Wrench, cultural: Music2, sports: Dumbbell, seminar: Presentation,
  management: Megaphone, literary: BookOpen, music: Mic2,
};

/**
 * Event banner. Falls back to a designed, category-tinted cover (no stock
 * imagery) when no banner has been uploaded.
 */
export function EventCover({
  bannerUrl, title, categorySlug, color, className, priority,
}: { bannerUrl?: string | null; title: string; categorySlug?: string; color?: string; className?: string; priority?: boolean }) {
  if (bannerUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={bannerUrl} alt="" className={cn("h-full w-full object-cover", className)} loading={priority ? "eager" : "lazy"} decoding="async" />
    );
  }
  const Icon = (categorySlug && ICONS[categorySlug]) || CalendarDays;
  const c = color ?? "#3b4fd8";
  return (
    <div
      className={cn("relative flex h-full w-full items-end overflow-hidden", className)}
      style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${c} 88%, black) 0%, color-mix(in oklab, ${c} 70%, #0b1020) 100%)` }}
      aria-hidden
    >
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" preserveAspectRatio="none" viewBox="0 0 400 200">
        <defs>
          <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="white" />
          </pattern>
        </defs>
        <rect width="400" height="200" fill="url(#dots)" />
        <circle cx="340" cy="30" r="90" fill="white" opacity="0.25" />
      </svg>
      <Icon className="absolute top-1/2 right-6 size-16 -translate-y-1/2 text-white/25" strokeWidth={1.4} />
      <span className="relative m-4 line-clamp-2 max-w-[75%] text-lg leading-snug font-semibold text-white/95">{title}</span>
    </div>
  );
}
