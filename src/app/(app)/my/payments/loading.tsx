import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading payments">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 mb-6 h-4 w-72 max-w-full" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
