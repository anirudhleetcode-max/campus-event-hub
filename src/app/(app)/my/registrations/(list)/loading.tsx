import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading registrations">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 mb-6 h-4 w-80 max-w-full" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface sm:flex-row">
            <Skeleton className="aspect-[16/7] rounded-none sm:aspect-auto sm:h-40 sm:w-48" />
            <div className="flex-1 space-y-3 p-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
