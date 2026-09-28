import { Skeleton } from "@/components/ui/misc";

export default function EventDetailsLoading() {
  return (
    <div className="container-page py-6 sm:py-10" aria-busy="true" aria-label="Loading event">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-4 aspect-[16/9] w-full rounded-2xl sm:aspect-[21/8]" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
          <div className="grid gap-4 pt-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
          <div className="space-y-2 pt-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
