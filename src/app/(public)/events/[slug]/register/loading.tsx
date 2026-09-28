import { Skeleton } from "@/components/ui/misc";

export default function RegisterLoading() {
  return (
    <div className="container-page py-8 sm:py-12" aria-busy="true" aria-label="Loading registration">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-5 h-8 w-3/4 max-w-lg" />
      <Skeleton className="mt-2 mb-8 h-4 w-72 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 space-y-4 rounded-xl border border-border bg-surface p-6 lg:order-1">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="ml-auto h-12 w-48" />
        </div>
        <div className="order-1 space-y-3 rounded-xl border border-border bg-surface p-6 lg:order-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
