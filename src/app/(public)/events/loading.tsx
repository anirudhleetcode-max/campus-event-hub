import { EventCardSkeleton } from "@/components/events/event-card";
import { Skeleton } from "@/components/ui/misc";

export default function EventsLoading() {
  return (
    <div className="container-page py-10 sm:py-14" aria-busy="true" aria-label="Loading events">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-8 space-y-3 rounded-xl border border-border bg-surface p-4">
        <Skeleton className="h-10 w-full" />
        <div className="hidden gap-3 md:grid md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
      <Skeleton className="mt-6 h-5 w-40" />
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
