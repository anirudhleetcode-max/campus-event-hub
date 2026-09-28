import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading registration">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      <Skeleton className="mt-2 h-5 w-40" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
