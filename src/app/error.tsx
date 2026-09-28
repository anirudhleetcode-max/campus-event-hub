"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-soft text-danger-soft-foreground">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        We couldn&apos;t load this page. This is usually temporary — please try again. If it keeps happening, contact your college administrator.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Link href="/" className={buttonClasses("outline")}>
          Go home
        </Link>
      </div>
    </div>
  );
}
