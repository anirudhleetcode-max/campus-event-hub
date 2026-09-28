import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
        <Compass className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-1 text-2xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">The link may be broken, or the page may have been moved or removed.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/events" className={buttonClasses("primary")}>
          Explore events
        </Link>
        <Link href="/" className={buttonClasses("outline")}>
          Go home
        </Link>
      </div>
    </div>
  );
}
