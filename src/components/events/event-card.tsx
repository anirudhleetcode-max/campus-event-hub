import Link from "next/link";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import type { PublicEventCard } from "@/server/services/events";
import { Badge } from "@/components/ui/badge";
import { EVENT_MODE } from "@/lib/labels";
import { formatDate, formatMoney, formatTime } from "@/lib/utils";
import { registrationCta } from "@/lib/event-status";
import { EventCover } from "./event-cover";

export function EventCard({ event }: { event: PublicEventCard }) {
  const remaining = Math.max(0, event.capacity - event.seatsTaken);
  const cta = registrationCta(event, event.seatsTaken, null);
  const state =
    cta.state === "open" ? (remaining <= Math.max(3, event.capacity * 0.1) ? { t: "warning" as const, l: `Only ${remaining} left` } : null)
      : cta.state === "full" ? { t: "danger" as const, l: "Full" }
      : cta.state === "cancelled" ? { t: "danger" as const, l: "Cancelled" }
      : cta.state === "ended" ? { t: "neutral" as const, l: "Ended" }
      : event.status === "ONGOING" ? { t: "primary" as const, l: "Happening now" }
      : cta.state === "not_open" ? { t: "info" as const, l: "Opens soon" }
      : { t: "neutral" as const, l: "Registration closed" };
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/8] overflow-hidden bg-surface-2">
        <EventCover bannerUrl={event.bannerUrl} title={event.title} categorySlug={event.category.slug} color={event.category.color} className="transition-transform duration-300 group-hover:scale-[1.02]" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <Badge className="bg-surface/95 text-foreground ring-0 backdrop-blur">{event.category.name}</Badge>
          {state && <Badge tone={state.t} className="ring-0">{state.l}</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium text-muted-foreground">
          {event.college.shortName ?? event.college.name}
          {event.department ? ` · ${event.department.code}` : ""}
        </p>
        <h3 className="mt-1 line-clamp-2 text-base leading-snug font-semibold">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {event.title}
          </Link>
        </h3>
        <ul className="mt-3 mb-4 space-y-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            {formatDate(event.startsAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="size-4 shrink-0" aria-hidden />
            {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{event.mode === "ONLINE" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", ") || EVENT_MODE[event.mode]}</span>
          </li>
        </ul>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-base font-semibold">{formatMoney(event.feeAmount, event.currency)}</p>
            <p className="text-xs text-muted-foreground">Register by {formatDate(event.registrationDeadline, { day: "numeric", month: "short" })}</p>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3.5" aria-hidden />
            <span className="tabular-nums">{remaining === 0 ? "Full" : `${remaining}/${event.capacity} left`}</span>
          </p>
        </div>
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="aspect-[16/8] animate-pulse bg-surface-3" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-3" />
        <div className="h-5 w-4/5 animate-pulse rounded bg-surface-3" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-3" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-surface-3" />
      </div>
    </div>
  );
}
